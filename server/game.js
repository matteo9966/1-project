import {EventEmitter} from 'events';
export class Game extends EventEmitter{
    game;
    players = new Map(); //mappa di quelli che hanno giocato //mappa websocket -> numero scelto 
    played=0;   //giocatori che hanno giocato
    /**@type {any[]}*/room;
    // roomSize=0; //giocatori nella stanza
    constructor(){
        super();
        // this.room=room;
        // this.roomSize =this.room.length;
        
    }
    
    //il resto lo finisco domani mattina e inizio con il tictactoe senza websocket.io
    playGame(ws,room){
        if(this.players.has(ws)){
            return null //se restituisco null, il giocatore ha già giocato
        }
        const num = this.generateNumber();
        this.players.set(ws,num);
        this.played = this.players.size;
        if(this.played===room.length){ 
            this.gameComplete();
        }
        return num
    }

    generateNumber(){
        return Math.random()*100;
    }

    gameStart(){
        this.emit('start');
    }

    gameComplete(){
        const winnersocket = this.getWinner(); // il websocket vincente
        const result = this.players.get(winnersocket);
        this.emit('complete',winnersocket,result);
    }
    gameClosed(){
        this.emit('finish')
    }

    getWinner(){
        let max = -Infinity;
        let winner = null;
        this.players.forEach((num,ws)=>{
           if(num>max){
             winner =ws;
             max=num
           }
        })
       return winner; // mi restituisce il ws vincente
    }
}


