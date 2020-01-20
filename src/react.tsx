// src/react.tsx
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { IRemoteShellRouter, uuid, IRemoteShell } from "./lib"

const args = window.process.argv.slice(-2);
const channel = args[1];
console.log("[render/init] with: ", args);

interface TerminalProps {
    buffer: string;
    onSend: (text: string) => void;
}

interface TerminalState {
    ref: uuid,
    data: any
}

class ScreenTerminal extends React.Component<TerminalProps> {
    state = {
        text: "",
    }
    _handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
        const { text } = this.state;
        const { onSend } = this.props;
        if (e.key == 'Enter' && text.length > 0) {
            onSend(text)
            this.setState({ text: "" })
        }
    }
    render() {
        const { buffer } = this.props;
        const { text } = this.state;
        return (
            <div style={{ borderWidth: "1px", borderColor: 'black' }}>
                <p>Terminal</p>
                <pre>
                    {buffer}
                </pre>
                <input
                    style={{
                        position: 'fixed', bottom: 0, left: 0,
                        width: '100%',
                        height: 52
                    }}
                    placeholder=">..."
                    value={text}
                    onChange={(event) => this.setState({ text: event.target.value })}
                    onKeyDown={this._handleKeyPress}
                />
            </div>
        )
    }
}

interface TerminalRouterState {
    map: Array<TerminalState>
    active: number
}
class TerminalRouter extends React.Component<{}, TerminalRouterState> {
    router: IRemoteShellRouter;
    state = {
        map: Array<TerminalState>(),
        active: 0,
    }
    componentWillMount() {
        this.router = new IRemoteShellRouter(channel);
        this.router.shellCreated = this._created;
        this.router.shellWrite = this._write;
        this.router.shellDestroyed = this._destroyed;
        this.router.create();
    }
    _created = (ref: IRemoteShell) => {
        console.log("[TerminalRouter] created: ", ref)
        this.setState((prevState) => ({
            map: prevState.map.concat({ ref: ref.ref(), data: ref.buffer() })
        }))
    }
    _destroyed = () => {
        console.log("[TerminalRouter] _destroying: ")
    }
    _write = (ref: IRemoteShell) => {
        console.log("[TerminalRouter] _write: ", ref)
        this.setState((prevState => ({
            map: prevState.map.map((e) => {
                if (e.ref == ref.ref()) {
                    console.log("[TerminalRouter] update buffer: ", ref.buffer())
                    return {
                        ...e,
                        data: ref.buffer()
                    }
                }
                return e;
            })
        })))
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
        const { map } = this.state;
        if (map.length < 1) {
            return this._renderPrompt();
        }
        const screen = map[this.state.active];
        return (
            <ScreenTerminal
                buffer={screen.data}
                onSend={(data) => this._onSend(screen.ref, data)} />
        )
    }
    _renderTabBar = () => {
        const { active, map } = this.state;
        const _tabs = map.map((e, index) => (
            <div
                key={e.ref}
                style={{ display: 'inline', backgroundColor: active == index ? 'red' : 'white' }}
                onClick={() => this.setState({ active: index })}>
                <p>{e.ref} - {index}</p>
            </div>
        ));
        return (
            <div className="d-flex flex-row" >
                {_tabs}
            </div>
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