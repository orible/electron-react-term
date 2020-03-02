import { ipcRenderer, ipcMain, BrowserWindow } from "electron"
import * as child from 'child_process'

/**
 * Serialize object into http query arguments
 * eg:
 *  {
 *      username: "Bob",
 *      sortBy: "Decending",
 *      true: false
 *  }
 *  returns:
 *      username=Bob&sortBy=Decending&true=false
 * @param obj object to stringify
 * @param prefix prefix to add before item
 */

export function serialize(obj: object, prefix: string = undefined) {
    var str = [];
    for (var p in obj) {
        if (obj.hasOwnProperty(p)) {
            var k = prefix ? prefix + "[" + p + "]" : p,
                v = obj[p];
            str.push(typeof v == "object" ? serialize(v, k) : encodeURIComponent(k) + "=" + encodeURIComponent(v));
        }
    }
    return str.join("&");
}


export type caller = string
export type uuid = string

export interface message {
    action: uuid;
    data: any;
}

function message(action: uuid, data: any): message {
    return { action, data };
}

let uuid = 0;

/**
 * IRef
 * Provides a unique identifier to a class instance.
 */
export class IRef {
    uuid: uuid
    constructor() {
        uuid += 1;
        this.uuid = `${uuid}`;
    }
    ref = (): uuid => this.uuid;
}

/**
 * IRendererShellClient
 * Render process side, this listens to messages from it's main-process counterpart.
 */
export class IRendererShellClient extends IRef {
    private _buffer: string;
    private _chunks: Array<Buffer>;
    constructor() {
        super()
        this._chunks = Array<Buffer>();
        //ipcRenderer.addListener(this.ref(), this._event)
    }

    /**
     * Currently messages are dispatched through the main router, 
     * the experimental alternative is to use ipc to each router object.
     */
    public _event = (event, args: message) => {
        switch (args.action) {
            case 'data':
                console.log("[IShell] in => ", args.data.data.toString())
                this.buffer += args.data;
                break;
            default:
                break;
        }
    }
    public onClose = () => {
        ipcRenderer.removeListener(this.ref(), this._event)
    }
    public buffer = (): string => {
        return this._buffer;
    }
    public add = (data: any) => {
        this._buffer += data;
        this._chunks.push(data);
    }
    public chunks = () => {
        return this._chunks;
    }
}

/**
 * IRendererShellClientRouter
 * Render process side, this listens to messages from it's main-process counterpart.
 * It can also request actions, and is then informed with an event callbackor sync return.
 */
export class IRendererShellRouter {
    private channel: string;
    private listeners: Array<IRendererShellClient>;
    public onShellCreated: (ref: IRendererShellClient) => any;
    public onShellWrite: (ref: IRendererShellClient) => any;
    public onShellDestroyed: (ref: IRendererShellClient) => any;
    constructor(chan: string) {
        this.listeners = new Array<IRendererShellClient>();
        this.channel = chan;
        ipcRenderer.on(this.channel, this._event)
        ipcRenderer.send(this.channel, message('init', null))
    }
    children(): Array<IRendererShellClient> {
        return this.listeners;
    }
    private _destroyContainer = (uuid: string) => {
        let index = this.listeners.findIndex((v) => v.ref() == uuid)
        if (index < 1) {
            console.log("[IRendererShellClientRouter] tried to destroy listener that does not exist!");
            return
        }
        this.listeners[index].onClose();
        this.listeners.splice(index, 1);
    }
    private _writeBuffer = (target: uuid, data: any): IRendererShellClient => {
        const v = this.listeners.find((v) => v.ref() == target);
        if (!v)
            return null;
        v.add(data)
        return v;
    }
    private _get = (uuid: string): IRendererShellClient | null => {
        return this.listeners.find((v) => v.ref() == uuid);
    }
    private _event = (event, args: message) => {
        switch (args.action) {
            case "create-fail":
                // we called, "create" and the main process subsequently failed to open a terminal, 
                // so we destroy the waiting container.
                this._destroyContainer(args.data);
                break;
            //case "create-ok":
            // we called, "create", and the main process subsequently opened a terminal.
            //    break;
            case "init":
                this.onShellCreated(this._get(args.data))
                break;
            case "add":
                // the core is telling us we're getting a terminal!
                // this also happens on window creation.
                this.create();
                break;
            case "data":
                console.log("[IRendererShellClientRouter] write")
                let ref = this._writeBuffer(args.data.ref, args.data.data);
                if (ref && this.onShellWrite) {
                    this.onShellWrite(ref);
                }
                break;
            case "losing":
                // the core is telling us we're losing a terminal (could be moved to new window).
                // so we destroy the container.
                this._destroyContainer(args.data);
                break;
            case "close":
                // the core is telling us the window is going to close, 
                // so we destroy everything here.
                break;
            default:
                break;
        }
    }
    private _create = (): uuid => {
        let ref = new IRendererShellClient();
        this.listeners.push(ref);

        // request main process create a shell for us, 
        // and send the this-side string ref as the identifying callback id.
        ipcRenderer.send(this.channel, message('create', ref.ref()));
        return ref.ref();
    }
    public create = (): uuid => {
        return this._create();
    }
    public send = (windowRef: string, data: any) => {
        ipcRenderer.send(this.channel, message('input', { ref: windowRef, data: data }))
    }
}


/**
 * IShell.
 * 
 * This class directly owns a shell instance and communicates with the remote listener.
 */
export class IProcessShell extends IRef {
    private proc: child.ChildProcessWithoutNullStreams;
    private windowRef: BrowserWindow; //may change during the program lifetime
    private channelRef: uuid;
    private remoteRef: uuid;
    private alive: boolean = false;
    public attachedRef = (): string => {
        return this.remoteRef;
    }
    // Construct references
    constructor(
        ctx: child.ChildProcessWithoutNullStreams,
        channel: string,
        ref: BrowserWindow,
        remoteRef: uuid) {
        super()
        this.remoteRef = remoteRef;
        this.channelRef = channel;
        this.windowRef = ref;

        ctx.on('error', this._err)
        ctx.stdout.on('data', this._stdout)
        this.proc = ctx;
    }
    send = (text: string) => {
        console.log("[IShell] send")
        this.proc.stdin.write(text + "\n")
    }
    private _init = () => {
        console.log("[IShell] signalling listener that instance is alive.")
        this.windowRef.webContents.send(
            this.channelRef,
            message('init', this.remoteRef))
    }
    private _open = (code) => {

    }
    private _err = (err: Error) => {
        //The 'error' event is emitted whenever:
        // The process could not be spawned, or

        // The process could not be killed, or
        // Sending a message to the child process failed.

        //https://nodejs.org/api/child_process.html#child_process_subprocess_stdin
        console.log("[IShell] err => ", err)
    }
    private _close = (code: number, signal: string) => {

    }
    private _sendToRenderer = (data: any) => {
        console.log("[IShell] _sendRemote => ", data)
        this.windowRef.webContents.send(
            this.channelRef,
            message('data', { ref: this.remoteRef, data }))
    }
    // stdin, input into the terminal
    private _stdin = (chunk: any) => {

    }
    // stdout, the terminal has printed something.
    private _stdout = (chunk: Buffer) => {
        if (!this.alive) {
            this._init();
            this.alive = true;
        }
        console.log("[IShell] _stdout")
        this._sendToRenderer(chunk)
    }
    public setOutput = (window: BrowserWindow, channel: uuid, remote: uuid) => {
        this.windowRef = window;
        this.channelRef = channel;
        this.remoteRef = remote;
    }
    public close = () => {
        this.proc.kill("SIGKILL");
        this.windowRef = null;
        //this.proc.disconnect();
        this.proc.removeAllListeners();
        this.proc = null;
    }
}

/**
 * IProcessWindowController
 * This communicates with the remote render process.
 * It is responsible for opening and closing shells and
 * notifying the remote listener of state change.
 */
export class IProcessWindowController extends IRef {
    winRef: BrowserWindow;
    private procs: Array<IProcessShell>;
    private getChannel(): string {
        return `event_${this.ref()}`;
    }
    constructor() {
        super()
        console.log("[IRemoteWindow] init")
        ipcMain.on(this.getChannel(), this._event);
        this.procs = new Array<IProcessShell>();
        this.winRef = new BrowserWindow({
            width: 800,
            height: 600,
            webPreferences: {
                nodeIntegration: true,
                // give the channel it's callback id to communicate with
                additionalArguments: ["channel", this.getChannel()],
                devTools: true
            }
        });
        // and load the index.html into the renderer
        this.winRef.loadFile(`index.html`);
    }
    private _open = (remoteRef: string): IProcessShell => {
        var type = [
            'cmd',
            'powershell',
            'bash',
        ];
        // try spawning the process
        let ctx = child.spawn(type[0]);

        // load shell object into array
        let ref = new IProcessShell(ctx, this.getChannel(), this.winRef, remoteRef);
        this.procs.push(ref);

        console.log("[IShellRouter] opening process...");
        return ref;
    }
    private _getShell = (uuid: string): IProcessShell => {
        return this.procs.find((v) => v.attachedRef() == uuid)
    }
    private _event = (action, args: message) => {
        console.log("[IProcessWindowController] event: ", args)
        switch (args.action) {
            case 'init':
                break;
            case 'close':
                break;
            case 'move':
                break;
            case 'input':
                //sent from the renderer-process
                const ref = this._getShell(args.data.ref);
                if (ref)
                    ref.send(args.data.data)
                else
                    console.log("[IShellRouter] bad ref")
                break;
            case 'create':
                // The remote renderer is asking us to create a shell process.
                this._open(args.data);
                break;
            default:
                break;
        }
    }
    private _closeShell = (id: uuid) => {
        this.procs.find((v) => v.ref() == id);
    }
    close = () => {
        ipcMain.removeListener(this.getChannel(), this._event);
        this.winRef.close();
    }
}

export class IProcessController {
    _windows = new Array<IProcessWindowController>();
    public createWindow = (): IProcessWindowController => {
        this._windows.push(new IProcessWindowController());
        return this._windows[this._windows.length - 1];
    }
}