const {SerialPort} = require('serialport');
const {ReadlineParser} = require('@serialport/parser-readline');
const { autoDetect } = require('@serialport/bindings-cpp');
const isOdd = require("is-odd");

class ArduinoSerial{
    mensajes = {
        arduinoRequest: "Se pidió una conexión con el arduino en el puerto ",
        connecting: "Conectando...",
        checkingFailed: "Parece que el dispositivo conectado no trae el software necesario",
        disconnecting: "Desconectando...",
        errorConnecting: "Hubo un error al conectar con arduino: ",
        connectionSuccessful: "Conectado exitosamente al arduino",
        ArduinoDisconnection: "Se ha desconectado el Arduino",
        ArduinoIsNoLongerConnected: "Parece que el arduino ya no se encuentra desconectado",
        AppWereReseted: "Parece que el servidor se recargó y el arduino ya no está conectado",
        shareData: "Compartiendo datos",
    }
    
    constructor() {
        this.isConnected = false;
        // this.readLine = SerialPort.parser.readLine();
        // this.parser = new readLine();
    }

    /**
     * Inicializa la conexión con arduino mostrando un mensaje de espera
     * También activa la recepción de información
     * @param {number} port puerto serie en el que se estará estableciendo la conexión
     * @param {io.socket} socket objeto websocket necesario en la funcion establishConnection()
     */
    init = async function (port, socket, server) {
        await this.wait(500, this.mensajes.connecting);
        this.server = server;
        this.port = this.establishConnection(port, socket);
        this.parser = new ReadlineParser();
        this.port.pipe(this.parser);
        this.receiveData(socket);
    }

    /**
     * Se Establece una conexión con el puerto serial indicado y comunica el estado de la conexión a
     * través de un web socket
     * @param {number} port Puerto serie en el que se estará estableciendo la conexión
     * @param {io.socket} socket Websocket en el que se comunicará el estado de la conexión con arduino
     * @returns {Promise} Al resolver la promesa se retornará el objeto serial para conectarse
     */
    establishConnection = function (port, socket) {
        const messages = this.mensajes
        const servidor = this.server;
        // Verificar que el arduino traiga el software
        this.timeForVerifying = setTimeout(()=>{
            if (this.isConnected) {
                socket.emit(this.server.sockets.versionSoftwareArduino, 
                    {
                        hasTheProgram: true,
                        message: "El dispositivo no tiene el software adecuado"
                    });    
                console.log(this.mensajes.checkingFailed);
                this.disconnect(socket, this.server);
            }
        }, 3000);

        // return new Promise( function (resolve, reject) {
            console.log(messages.arduinoRequest + port);
            const serial = new SerialPort({
                path: port,
                baudRate: 115200
            }, function (err) {
                if (err) {
                    clearTimeout(this.timeForVerifying);
                    console.log(messages.errorConnecting, err);
                    socket.emit(servidor.sockets.estadoArduino, 
                        {
                            isConnected: false, 
                            error: true, 
                            message: err.message
                        });
                        this.isConnected = false
                } else {
                    console.log(messages.connectionSuccessful);
                    socket.emit(servidor.sockets.estadoArduino, 
                        {
                            isConnected: true, 
                            error: false, 
                            message: ""
                        });
                    this.isConnected = true
                }
            });
            // resolve(serial)
        // })
        return serial;
    }

    /**
     * Espera un momento y muestra un mensaje
     * @param {string} message mensaje que mostrar en el servidor
     * @returns {Promise}
     */
    wait = function (time, message) {
        return new Promise( (resolve, reject)=> {
            if (message) {
                console.log(message);
            }
            setTimeout(() => {
                resolve(true)
            }, time);
        })
    }

    /**
     * TODO: establecer el intercambio de información con arduino
     * @param {function} callback funcion a ejecutar
     */
    receiveData = function (socket, sendData) {
        console.log("Activada la recepción de información desde arduino");
        this.parser.on('data', data => {
            try{
                // console.log(data);
                const datos = JSON.parse(data);
                // console.log(datos.accion);
                if (datos.accion === "monitoreo") 
                {
                    this.analizaDatosDeEntrada(datos, socket, this.server);
                }
                if (datos.accion === "mensaje") {
                    console.log(datos.message);
                }
                if (datos.accion === "test") {
                    clearTimeout(this.timeForVerifying);
                    console.log(datos.message);
                    socket.emit(this.server.sockets.versionSoftwareArduino, 
                        {
                            hasTheProgram: true,
                            message: "El dispositivo tiene el software adecuado"
                        });
                }
            }
            catch(err){
                console.log("LLegó un dato erroneo: ",err.message);
                this.disconnect(socket, this.server);
                clearTimeout(this.timeForVerifying);
            }
        });
    }

    sendData = async function (data) {
        return this.port.write(data);
    }

    /**
     * Desconecta el arduino del puerto serie
     */
    disconnect = async function (socket, servidor) {
        await this.wait(500, this.mensajes.disconnecting);
        if (this.port) {
            await this.port.close();
            console.log(this.mensajes.ArduinoDisconnection);
        }
        else{
            console.log(this.mensajes.AppWereReseted);
        }
        this.isConnected = false;
        socket.emit(servidor.sockets.estadoArduino, 
            {
                isConnected: false, 
                error: false,
                message: ""
            });
    }

    analizaDatosDeEntrada = function (datos, socket, servidor) {
        let arrayFinal = [];
        arrayFinal.push(datos.sensor1);
        arrayFinal.push(datos.sensor2);
        arrayFinal.push(datos.sensor3);
        arrayFinal.push(datos.sensor4);
        arrayFinal.push(datos.sensor5);
        // console.log(arrayFinal);
        // Enviar datos al servidor por web sockets
        socket.emit(servidor.sockets.intercambiarDatos, arrayFinal);
    }

    enviarPuertosDisponibles = async function (socket, servidor) {
        const puertos = await SerialPort.list();
        socket.emit("ports", puertos);
    }
    
}

module.exports = ArduinoSerial