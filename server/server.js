import WebSocket,{ WebSocketServer } from "ws";
import { EventEmitter } from "events";
import { parseJson } from "./utils.js";
import { Game } from "./game.js";
/**
 * @typedef Message
 * @prop {"create"|"join"|"leave"|"play"} type the message type
 * @prop {Record<string,any>} props the properties of the message
 * @description 
 * nel caso di create il messaggio è 
 * 
 * CREATE
 * {type:"create",
 *   props:{
 *   username:"nome"
 * }}
 *
 * JOIN
 * {type:"join",
 *   props:{
 *   username:"nome",
 *   key:"room"
 * }}
 * 
 * LEAVE
 * {type:"leave",
 *  props:{
 *   key:"room"
 * }}
 * }
 * 
 * PLAY
 * {type:"play",
 * props:{size:number}}
 * 
 */

class GameSocketServer extends EventEmitter {
  constructor(port) {
    super();
    this.intervalID = null; // uso un interval per fare ping a tutti i clienti e se ho un cliente morto lo rimuovo dal room;
    this._server = null;
    this.maxClients = 5;
    this.port = port;
    /**@type {Map<string,Game>}*/this.games = new Map(); // associo a ogni room un game
    // /**@type {Game}*/ this.game = game; //
    /**@type {Map<string,WebSocket[]>}*/this.rooms = new Map();
    this._init();
    this.on('error',(error,socket)=>{
      if(error.message){
        this.sendMessage(socket,{message:error.message,error:true})
      }
    })
  }
  _init() {
    //crea il ws server
    this._server = new WebSocketServer({ port: this.port }); // ho creato il server

    this._server.on("listening", () =>
    {this._checkClients()
      console.log("server up and running on port", this.port)}
    );

    this._server.on('close',()=>{
      this.intervalID && clearInterval(this.intervalID);

    })
    this._server.on("connection", (ws, request) => {
      ws.on("message", (data) =>{
        const message = parseJson(data.toString('utf-8'));
        if(!message){
          return this.emit('error',new Error('invalid json format '),ws)
        }
        this._handleMessage(ws,message)});

      ws.on("message",data=>{console.log(data.toString())}); //! only for debug
      const that = this; //solo per flexare
      ws.on('pong',function(){that._addMetadata(this,{isAlive:true});console.log('pong')})


    });
  }

  _handleMessage(ws, /**@type {Message}*/ message) {
    //analizzo il messaggio , se  è una stringa provo a fare il parse del json se è un json 
    
   
    switch (message.type) {
      case "create":
      { 
      const key = this._createRoom(ws);
       if(key){
        //aggiungo il metadata al room
        const {username} = {...message?.props} // per adesso solo username
        this._addMetadata(ws,{username,isAlive:true,room:key}); //aggiungo anche il room al metadata
        const room = this.getRoom(key) 
        this.createGame(key,room); // ho creato il gioco
        this.sendMessage(ws,{message:`room created with id: ${key} ,user added ${username}, game created`,room:key})
        //creo l'istanza del gioco
        //creo l'istanza del gioco e la associo al room?
       }else{
        this.emit('error','room was not created',ws);
       }
      }
        
        break;


        case "join":
       {   
        //TODO: cosa succede se ho raggiunto il numero massimo di utenti?
         const {username,key:room} = {...message?.props};
         const key = this._joinRoom(ws,room);
         if(key){
       this._addMetadata(ws,{username,isAlive:true,room:key})
       this._broadcastToRoom(key,`${username} joinded the room`)
         }
         else{
          this.emit('error','user was not added to room',ws);
         }


       }
        break;

        case "leave" : {
          //il ws ha una chiave e vuole andarsene dal room
          const {key} = {...message?.props}
          const {username} = ws; 
          let removed = false;
          if(key){
           removed = this._removeClientfromRoom(key,ws);
          }else {
            this.emit('error','wrong key',ws);
          }
          if(!removed){
            this.emit('error','client was not removed',ws)
          }else{
             this._broadcastToRoom(key,`client removed: ${username} from room: ${key}`)
             return
          }

    

        }
        break;

        case "play":
          {
             const {room} = ws;
             const playersRoom = this.getRoom(room) // questo è l'array di partecipanti
            const number = this.games.get(room).playGame(ws,playersRoom);
            if(!number){
              return this.emit('error',new Error('player already played'),ws);
            }
            this.sendMessage(ws,`you played the number: ${number}`);
          }
          break

      default:
        this.sendMessage(ws,{message:'error handling message, valid messages:create|join|leave',error:true})
        break;
    }
  }

  sendMessage(socket, message) {
    const packet = JSON.stringify(message);
    socket.send(packet);
  }


  _genkey(length) {
    let result = "";
    const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    for (let i = 0; i < length; i++) {
      result += characters.charAt(
        Math.floor(Math.random() * characters.length)
      );
    }
    return result;
  }

  _createRoom(ws) {
    const key = this._genkey(5);
    // ws['room'] = key
    this.rooms.set(key, []); //aggiungo un ws a questo room
    
    return this._joinRoom(ws, key); //ho creato il room
  }


  _joinRoom(ws, key) {
    const room = this.rooms.get(key);
    if (!room) {
      this.emit("error", `no room ${room}`, ws); // restituisco anche il web socket
      return;
    }
    if (room.includes(ws)) {
      this.emit("error", `room includes ws`,ws);
      return;
    }
    room.push(ws); // quello che posso fare è vedere se ws è già presente
    //di a qualcuno che mi sono aggiunto al room
    return key; // se key !== null allora è andato tutto bene
  }

  _addMetadata(ws, /**@type {Record<string,any>}*/ data) {
    Object.entries(data).forEach(([key, value]) => {
      ws[key] = value; // tutte le proprietà che mi servono
    });
    //quello che aggiungo è username e key
  }


/**
 * @description uso questa funzione per fare un ping a tutti i clienti e rimuovere quelli che non ci sono più
 */
  _checkClients(){

    this.intervalID = setInterval(()=>{
      this._server.clients.forEach(ws=>{
        if(ws.isAlive==false){

          //TODO: rimuovi ws dal room a cui appartiene 

          return ws.terminate(); // termino il ws perchè ormai si è disconnesso
        }
        ws.isAlive=false; // 
        ws.ping(); // al pong del ws metto isAlive = true;
      })
    },5000)
  }

  /**
   * 
   * @param {string} room chiave del room
  * @param {Record<any,any>| string} data quello che mando al user 
   */
  _broadcastToRoom(room,data){
    let message;
    if(typeof data === 'string'){
       message = {message:data}
    }else {
      message = data ;
    }

    //mi aspetto sia un oggetto
    const broadcast = this.rooms.get(room) 
    if(!broadcast) return
    broadcast.forEach(ws=>this.sendMessage(ws,message))
  } 

  /**
   * 
   * @param {string} key 
   * @param {WebSocket} ws 
   */
  _removeClientfromRoom(key,ws){
     const room = this.rooms.get(key);
     if(!room){
      return this.emit('error',`room ${key} does not exist`)
     }
     const filteredRoom = room.filter(ws=>ws!==ws); // non c'è più
     this.rooms.set(key,filteredRoom) // aggiorno il room;
     
     return filteredRoom.length !== room.length // se non sono uguali ho rimosso un elemento
  }

  getRoom(key){
   return this.rooms.get(key);
  }

  createGame(key,room){
    this.games.set(key,new Game())
    const game = this.games.get(key);
    const listenWinner = (winnersocket,result)=>{
      const {username} = {...winnersocket};
      // this.sendMessage(winnersocket,`you won the game with : ${result}`)
      setTimeout(()=>{
        this._broadcastToRoom(key,`the winner of the room is ${username} with value ${result}`)
      },2000)
    }
    game.once('complete',listenWinner);
    //posso rimuovere il gioco
  }

}

const server = new GameSocketServer(5400);
