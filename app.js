var Buffer = require('buffer/').Buffer
var config = require('config-yml');
const { error } = require('console');

exports.handler = async (event) => {
    let pdecoder = new decoder()
    const response = pdecoder.decodePacket(event['encodedData'], config.header)
    return response;
};

class decoder{
    decodePacket(base64Packet, headerConfig){
        let hexPacket = this.convertToHex(base64Packet)
        let [header, remainder] = this.decode(hexPacket, headerConfig)
        let [dataPacket, notAvailable] = this.decode(remainder, config.heartbeat)
        header['heartbeat'] = dataPacket
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
            } else {
                throw new Error('missed bytes in packet')
            }
        }
        return [iotPacket, remainderPacket]
    }

    hexToFloat(hex){
        const buffer = Buffer.from(hex, 'hex')
    }

    convertToHex(base64Packet){
        const buffer = Buffer.from(base64Packet, 'base64');
        let bufString = buffer.toString('hex');
        bufString = this.slipDecode(bufString)
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
            let finalPosition = position + packetConfig['fields'][fieldName]['size']*2
            result[i] = hexPacket.slice(position, finalPosition)
            i++
            position = finalPosition
        }
        console.log(result)
        return [result, hexPacket.slice(position, hexPacket.length)]
    }

    decodeString(hexString){
        return Buffer.from(hexString, 'hex').toString('utf8')
    }

    parseFloat(str, radix){
    var parts = str.split(".");
    if ( parts.length > 1 ){
        return parseInt(parts[0], radix) + parseInt(parts[1], radix) / Math.pow(radix, parts[1].length);
    }
    return parseInt(parts[0], radix);
    }


    formatMacID(hexString){
        hexString = hexString.replace(/(.{2})/g,"$1:")
        if (hexString.charAt(hexString.length-1) == ':'){
            hexString = hexString.slice(0,-1)
        }
        return hexString
    }
}

//uncomment for local testing
let pdecoder = new decoder()
let event = {}
event['encodedData'] = "AQrFTcN5cbRih8tpMhlPgSYyQDh4Q0KAgoCCgIIZ"
const response = pdecoder.decodePacket(event['encodedData'], config.header)
console.log(response);