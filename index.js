var Buffer = require('buffer/').Buffer
var config = require('config-yml');
const { error } = require('console');

exports.handler = async (event) => {
    let pdecoder = new decoder()
    console.log("encodedData: " + event['encodedData'])
    const response = pdecoder.decodePacket(event['encodedData'], config.header)
    return response;
};

class decoder{
    constructor() {
        this.packetStruct = []
        this.packetStruct[0] = config.header
        this.packetStruct[1] = config.heartbeat
        this.packetStruct[2] = config.action
        this.packetStruct[3] = config.devconfig
        this.packetStruct[4] = config.acceleration
        this.packetStruct[5] = config.userconfig
        this.packetStruct[6] = config.updatefw
        this.terminator = 'ff'
    }

    decodePacket(base64Packet, headerConfig){
        let hexPacket = this.convertToHex(base64Packet)
        let [header, remainder] = this.decode(hexPacket, this.packetStruct[0])
        let [dataPacket, notAvailable] = this.decode(remainder, this.packetStruct[header["type"]])
        header[Object.keys(config)[header["type"]]] = dataPacket
        return header
    }

    slipDecode(binaryPacket){
        let result = binaryPacket.replaceAll('8087','3b')
        result = result.replaceAll('8082','00')
        result = result.replaceAll('8083','08')
        result = result.replaceAll('8084','0d')
        result = result.replaceAll('8085','20')
        result = result.replaceAll('8086','2c')
        //this must be the last replace in order to avoid collisions
        result = result.replaceAll('8081','80')
        console.log("hex after slip decode: " + result)
        return result
    }

    decode(hexPacket, packetConfig){
        let [packetSplitHex, remainderPacket] = this.sliceHex(hexPacket, packetConfig)
        let iotPacket = {}

        let i = 0;
        for (let field in packetConfig['fields']){
            if (packetConfig['fields'][field]['type'] == 'int'){
                iotPacket[field] = parseInt(packetSplitHex[i], 16)
                i = i+1
            } else if (packetConfig['fields'][field]['type'] == 'macId'){
                iotPacket[field] = this.formatMacID(packetSplitHex[i])
                i = i+1
            } else if (packetConfig['fields'][field]['type'] == 'timestamp'){
                iotPacket[field] = new Date(parseInt(packetSplitHex[i], 16))
                i = i+1
            } else if (packetConfig['fields'][field]['type'] == 'rsr'){
                iotPacket[field] = parseInt(packetSplitHex[i], 16)*(-1/2)
                i = i+1
            } else if (packetConfig['fields'][field]['type'] == 'float'){
                iotPacket[field] = this.parseFloat(packetSplitHex[i], 16)
                i = i+1
            } else if (packetConfig['fields'][field]['type'] == 'unknown'){
                iotPacket[field] = "type unknown; bytes are:" + packetSplitHex[i]
                i = i+1
            } else if (packetConfig['fields'][field]['type'] == 'char'){
                iotPacket[field] = parseInt(packetSplitHex[i])
                i = i+1
            } else if (packetConfig['fields'][field]['type'] == 'short'){
                iotPacket[field] = parseInt(packetSplitHex[i], 16)
                i = i+1
            } else if (packetConfig['fields'][field]['type'] == 'string'){
                iotPacket[field] = this.hexToString(packetSplitHex[i])
                i = i+1
            } else if (packetConfig['fields'][field]['type'] == 'BLEversion'){
                let rawVersionString = packetSplitHex[i]

                let major = rawVersionString.slice(0, 2)
                let minor = rawVersionString.slice(2, 4)
                iotPacket[field] = parseInt(major)+"."+parseInt(minor)
                i = i+1
            } else {
                throw new Error('missed bytes in packet')
            }
            console.log("\n" + field + ": " + iotPacket[field])
        }
        return [iotPacket, remainderPacket]
    }

    hexToFloat(hex){
        const buffer = Buffer.from(hex, 'hex')
    }

    hexToString(hex) {
        var str = '';
        for (var n = 0; n < hex.length; n += 2) {
            str += String.fromCharCode(parseInt(hex.substr(n, 2), 16));
        }
        return str;
    }

    convertToHex(base64Packet){
        const buffer = Buffer.from(base64Packet, 'base64');
        let bufString = buffer.toString('hex');
        console.log("hexData: " + bufString)
        //bufString = this.slipDecode(bufString)
        return bufString
    }

    getByteSize(hexPacket){
        return hexPacket.length/2
    }

    getStructSize(packetConfig){
        let size = 0;
        for (let fieldName in packetConfig['fields']){
            size = size + packetConfig['fields'][fieldName]['size']
        }
        return size
    }

    //todo: return sliced remainder
    sliceHex(hexPacket, packetConfig){
        let result = []
        let position = 0
        let i = 0
        for (let fieldName in packetConfig['fields']){
            let finalPosition = packetConfig['fields'][fieldName]['size'];
            if(Number.isInteger(finalPosition)){
                finalPosition = position + packetConfig['fields'][fieldName]['size']*2
                result[i] = hexPacket.slice(position, finalPosition)
                i++
                position = finalPosition
            } else if(finalPosition = "variable"){
                finalPosition = hexPacket.indexOf(this.terminator)
                result[i] = hexPacket.slice(position, (finalPosition))
                //the following line removes the terminator byte
                hexPacket = hexPacket.slice(0, finalPosition-2) + hexPacket.slice(finalPosition)

                packetConfig['fields'][fieldName]['size'] = (finalPosition-2)-position
                i++
                position = finalPosition
            }
        }
        console.log("hexSlice: " + result)
        return [result, hexPacket.slice(position, hexPacket.length)]
    }

    decodeString(hexString){
        return Buffer.from(hexString, 'hex').toString('utf8')
    }

   parseFloat(str){
    return Buffer(str,'hex').readFloatLE(0);
   }


    formatMacID(hexString){
        hexString = hexString.replace(/(.{2})/g,"$1:")
        if (hexString.charAt(hexString.length-1) == ':'){
            hexString = hexString.slice(0,-1)
        }
        return hexString
    }
}

//note: data starting with:
// AQ is a heartbeat
// Ah is an action
// Ay is devconfig

//legacy event list with slip decoding
//"AQrFTcN5cbRih8tpMhlPgSYyQDh4Q0KAgoCCgIIZ"
//"AQrFTcN5cbSAgoCCgIKAgmJxYoCFMiRxgIKAgoCCgIKAgoCCgIKAgoCCgIKAgh0"

//event list(no slip):
//"AyrbilGGUPBjGSWElhlTBAEHBzM3LjAwLjcyNC1QMEMuNzIwMDEx/wEzNTkyMDUxMDI1MDE3NzQBADk="

//uncomment following lines for local testing, replace hex string with the hex string you want to test

//let event = {}
//event['encodedData'] = "AyrbilGGUPBjGSWElhlTBAEHBzM3LjAwLjcyNC1QMEMuNzIwMDEx/wEzNTkyMDUxMDI1MDE3NzQBADk="
//let pdecoder = new decoder()

//console.log("encodedData: " + event['encodedData'])
//const response = pdecoder.decodePacket(event['encodedData'], config.header)
//console.log("\ndecodedObject:\n", response);