// src/react.tsx
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { uuid, IRendererShellClient, IRendererShellRouter } from "./lib"

const args = window.process.argv.slice(-2);
const channel = args[1];
console.log("[render/init] with: ", args);

interface TerminalProps {
    chunks: Array<Buffer>;
    buffer: string;
    onSend: (text: string) => void;
    onActive: () => void;
}

interface TerminalState {
    ref: uuid,
    data: any
}


interface TerminalBufferState {
    text: string
}

class ScreenTerminal extends React.Component<TerminalProps, TerminalBufferState> {
    state = {
        text: "",
    }
    componentDidMount() {
        document.addEventListener('keypress', this._keyPress);
        document.addEventListener('keydown', this._deleteText);
    }
    _deleteText = (event: KeyboardEvent) => {
        const key = event.key; // const {key} = event; ES6+
        if (key === "Backspace" || key === "Delete") {
            this.setState((prevState) => ({
                text: prevState.text.slice(0, -1)
            }))
            return false;
        }
    }
    _keyPress = (event: KeyboardEvent) => {
        const isLetter = /^[a-z_\-.,!"'/$#<>{}:@~;' ]$/i.test(event.key)
        const isNumber = /^[0-9]$/i.test(event.key)

        console.log("Key: ", event.key, event.keyCode)
        if (event.key == 'Enter' && this.state.text.length > 0) {
            this.props.onSend(this.state.text);
            document.body.scrollIntoView(false);
            this.setState({ text: "" })
        }
        if (isLetter || isNumber) {
            this.setState((prevState: TerminalBufferState) => ({
                text: prevState.text += event.key.toString(),
            }))
        }
    }
    _handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
        const { text } = this.state;
        const { onSend } = this.props;
        if (e.key == 'Enter' && text.length > 0) {
            onSend(text)
            this.setState({ text: "" })
        }
    }
    _setActive = () => {
        this.props.onActive();
    }
    render() {
        const { buffer } = this.props;
        const { text } = this.state;
        return (
            <div style={{ borderWidth: "1px", borderColor: 'black' }} onClick={this._setActive}>
                <p>Terminal</p>
                {this.props.chunks.map((e, i, b) => <pre style={{ color: 'white' }}>{e.toString() + ((i == b.length - 1) ? text : "")}</pre>)}
                {false && <pre style={{ color: 'white' }}>
                    {buffer + text}
                </pre>}
                {false && <input
                    style={{
                        position: 'fixed', bottom: 0, left: 0,
                        width: '100%',
                        height: 52
                    }}
                    placeholder=">..."
                    value={text}
                    onChange={(event) => this.setState({ text: event.target.value })}
                    onKeyDown={this._handleKeyPress}
                />}
            </div>
        )
    }
}

interface TerminalRouterState {
    active: number
}
class TerminalRouter extends React.Component<{}, TerminalRouterState> {
    router: IRendererShellRouter;
    state = {
        active: 0,
    }
    componentWillMount() {
        // Init Renderer listener with channelId supplied from IProcessWindowController
        this.router = new IRendererShellRouter(channel);
        this.router.onShellCreated = () => {
            this.setState({});
        };
        this.router.onShellWrite = (ref: IRendererShellClient) => {
            this.setState({});
        }
        this.router.onShellDestroyed = () => {
            this.setState({});
        };
        this.router.create();
    }
    _onSend = (ref: string, data: string) => {
        console.log("[TerminalRouter] send")
        this.router.send(ref, data);
    }
    _renderPrompt = () => {
        return (
            <div>
                <text>Nothing here...</text>
            </div>
        )
    }
    _renderActive = () => {
        if (this.router.children().length < 1) {
            return this._renderPrompt();
        }
        const screen = this.router.children()[this.state.active];
        return (
            <ScreenTerminal
                onActive={() => false}
                buffer={screen.buffer()}
                chunks={screen.chunks()}
                onSend={(data) => this._onSend(screen.ref(), data)} />
        )
    }
    _renderTabBar = () => {
        const { active } = this.state;
        const _tabs = this.router.children().map((e, index) => (
            <div className="nav-item px-4"
                key={e.ref()}
                style={{ display: 'inline-block', backgroundColor: active == index ? 'black' : 'white', color: 'white' }}
                onClick={() => this.setState({ active: index })}>
                <p>{e.ref()}</p>
            </div>
        ));
        return (
            <nav className="d-flex flex-row navbar" style={{ backgroundColor: 'white' }} >
                {_tabs}
            </nav>
        )
    }
    render() {
        return (
            <div>
                {this._renderTabBar()}
                {this._renderActive()}
            </div>
        )
    }
}

const App = () => {
    return (
        <TerminalRouter />
    )
}

ReactDOM.render(<App />, document.getElementById('app'));