export function parseJson(strg){
    let obj = {}
    try {
     obj = JSON.parse(strg)
    } catch (error) {
      return null
    }
    return obj
}