// src/electron.js
import { app, BrowserWindow, ipcMain } from "electron"
import { message, IRemoteWindow } from "./lib"

const host = new Array<IRemoteWindow>();

class Terminal {
    uuid: string
    constructor(name: string) {
        
    }
    id = () => this.uuid
    show = () => false
    close = () => false
}

const listenerEvent = (action, args: message) => {
    switch(action) {
        case 'close':
            break;
        case 'move':
            break;
        case 'create':
            break;
        default:
            break;
    }
}

function createWindow() {
    // Create the browser window.
    host.push(new IRemoteWindow());
}

app.on('ready', createWindow);