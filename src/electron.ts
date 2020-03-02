// src/electron.js
import { app, BrowserWindow, ipcMain } from "electron"
import { message, IProcessController } from "./lib"

const controller = new IProcessController();


function createWindow() {
    // Create the browser window.
    controller.createWindow();
}

app.on('ready', createWindow);