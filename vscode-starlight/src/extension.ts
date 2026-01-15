import * as vscode from 'vscode';
import * as WebSocket from 'ws';

// Hub connection state
let hubConnection: WebSocket | null = null;
let hubStatusBar: vscode.StatusBarItem;

/**
 * Extension activation
 */
export function activate(context: vscode.ExtensionContext) {
    console.log('Starlight Protocol extension activated');

    // Create status bar item
    hubStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    hubStatusBar.text = '$(debug-disconnect) Starlight: Disconnected';
    hubStatusBar.command = 'starlight.startHub';
    hubStatusBar.show();
    context.subscriptions.push(hubStatusBar);

    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('starlight.startHub', startHub),
        vscode.commands.registerCommand('starlight.stopHub', stopHub),
        vscode.commands.registerCommand('starlight.runMission', runMission),
        vscode.commands.registerCommand('starlight.openMissionControl', openMissionControl),
        vscode.commands.registerCommand('starlight.createSentinel', createSentinel),
        vscode.commands.registerCommand('starlight.openTriage', openTriage)
    );

    // Register tree view providers
    const sentinelProvider = new SentinelTreeProvider();
    const missionProvider = new MissionTreeProvider();
    const hubProvider = new HubStatusProvider();

    vscode.window.registerTreeDataProvider('starlight-sentinels', sentinelProvider);
    vscode.window.registerTreeDataProvider('starlight-missions', missionProvider);
    vscode.window.registerTreeDataProvider('starlight-hub', hubProvider);

    // Auto-connect if configured
    const config = vscode.workspace.getConfiguration('starlight');
    if (config.get('autoStartHub')) {
        connectToHub();
    }
}

/**
 * Extension deactivation
 */
export function deactivate() {
    if (hubConnection) {
        hubConnection.close();
    }
}

/**
 * Start the Hub (launches external process)
 */
async function startHub() {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        vscode.window.showErrorMessage('No workspace folder open');
        return;
    }

    const terminal = vscode.window.createTerminal({
        name: 'Starlight Hub',
        cwd: workspaceFolder.uri.fsPath
    });
    terminal.show();
    terminal.sendText('node src/hub.js');

    // Wait a moment then try to connect
    setTimeout(() => connectToHub(), 2000);
}

/**
 * Stop the Hub
 */
async function stopHub() {
    if (hubConnection) {
        hubConnection.close();
        hubConnection = null;
    }
    hubStatusBar.text = '$(debug-disconnect) Starlight: Disconnected';
    vscode.window.showInformationMessage('Starlight Hub disconnected');
}

/**
 * Connect to the Hub via WebSocket
 */
function connectToHub() {
    const config = vscode.workspace.getConfiguration('starlight');
    const hubUrl = config.get<string>('hubUrl') || 'ws://localhost:8080';

    try {
        hubConnection = new WebSocket(hubUrl);

        hubConnection.on('open', () => {
            hubStatusBar.text = '$(debug-start) Starlight: Connected';
            hubStatusBar.command = 'starlight.stopHub';
            vscode.window.showInformationMessage(`Connected to Starlight Hub at ${hubUrl}`);
        });

        hubConnection.on('close', () => {
            hubStatusBar.text = '$(debug-disconnect) Starlight: Disconnected';
            hubStatusBar.command = 'starlight.startHub';
        });

        hubConnection.on('error', (error) => {
            vscode.window.showWarningMessage(`Hub connection error: ${error.message}`);
        });

        hubConnection.on('message', (data) => {
            try {
                const msg = JSON.parse(data.toString());
                handleHubMessage(msg);
            } catch (e) {
                // Ignore parse errors
            }
        });
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to connect to Hub: ${error}`);
    }
}

/**
 * Handle incoming Hub messages
 */
function handleHubMessage(msg: any) {
    if (msg.method === 'starlight.mission_complete') {
        const success = msg.params?.success;
        if (success) {
            vscode.window.showInformationMessage('✅ Mission completed successfully');
        } else {
            vscode.window.showWarningMessage('❌ Mission failed');
        }
    }
}

/**
 * Run a mission file
 */
async function runMission(uri?: vscode.Uri) {
    let missionFile = uri?.fsPath;

    if (!missionFile) {
        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor && activeEditor.document.fileName.includes('.intent.')) {
            missionFile = activeEditor.document.fileName;
        } else {
            const files = await vscode.workspace.findFiles('**/*.intent.js');
            if (files.length === 0) {
                vscode.window.showErrorMessage('No intent files found in workspace');
                return;
            }
            const selected = await vscode.window.showQuickPick(
                files.map(f => ({ label: vscode.workspace.asRelativePath(f), uri: f })),
                { placeHolder: 'Select mission to run' }
            );
            if (!selected) return;
            missionFile = selected.uri.fsPath;
        }
    }

    const config = vscode.workspace.getConfiguration('starlight');
    const headless = config.get<boolean>('headless') ? '--headless' : '';
    const browser = config.get<string>('browser') || 'chromium';

    const terminal = vscode.window.createTerminal({
        name: 'Starlight Mission',
        cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
    });
    terminal.show();
    terminal.sendText(`HUB_BROWSER_ENGINE=${browser} node bin/starlight.js "${missionFile}" ${headless}`);
}

/**
 * Open Mission Control in browser
 */
async function openMissionControl() {
    const config = vscode.workspace.getConfiguration('starlight');
    const url = config.get<string>('missionControlUrl') || 'http://localhost:3000';
    vscode.env.openExternal(vscode.Uri.parse(url));
}

/**
 * Create a new Sentinel file
 */
async function createSentinel() {
    const name = await vscode.window.showInputBox({
        prompt: 'Enter Sentinel name',
        placeHolder: 'MySentinel'
    });
    if (!name) return;

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        vscode.window.showErrorMessage('No workspace folder open');
        return;
    }

    const fileName = `${name.toLowerCase().replace(/\s+/g, '_')}_sentinel.py`;
    const filePath = vscode.Uri.joinPath(workspaceFolder.uri, 'sentinels', fileName);

    const content = `from sdk.starlight_sdk import SentinelBase


class ${name}(SentinelBase):
    """${name} - Custom Starlight Sentinel."""

    def __init__(self):
        super().__init__(
            layer='${name}',
            priority=5,
            capabilities=['detection', 'healing'],
            selectors=['.popup', '.modal']
        )

    async def on_pre_check(self, params: dict, msg_id: str) -> None:
        """Handle pre-check request from Hub."""
        blocking = params.get('blocking', [])

        if blocking:
            await self.send_hijack(msg_id, 'Clearing obstacles')
            for elem in blocking:
                await self.send_action('hide', elem['selector'])
            await self.send_resume()
        else:
            await self.send_clear(msg_id)


if __name__ == '__main__':
    import asyncio
    asyncio.run(${name}().start())
`;

    await vscode.workspace.fs.writeFile(filePath, Buffer.from(content, 'utf8'));
    const doc = await vscode.workspace.openTextDocument(filePath);
    await vscode.window.showTextDocument(doc);
    vscode.window.showInformationMessage(`Created ${fileName}`);
}

/**
 * Open Time-Travel Triage
 */
async function openTriage() {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        vscode.window.showErrorMessage('No workspace folder open');
        return;
    }

    const triagePath = vscode.Uri.joinPath(workspaceFolder.uri, 'launcher', 'triage.html');
    vscode.env.openExternal(triagePath);
}

/**
 * Tree view provider for Sentinels
 */
class SentinelTreeProvider implements vscode.TreeDataProvider<SentinelItem> {
    getTreeItem(element: SentinelItem): vscode.TreeItem {
        return element;
    }

    async getChildren(): Promise<SentinelItem[]> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) return [];

        try {
            const files = await vscode.workspace.findFiles('sentinels/*.py');
            return files.map(f => new SentinelItem(
                f.path.split('/').pop()?.replace('.py', '') || 'Unknown',
                f,
                vscode.TreeItemCollapsibleState.None
            ));
        } catch {
            return [];
        }
    }
}

class SentinelItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly resourceUri: vscode.Uri,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(label, collapsibleState);
        this.tooltip = this.resourceUri.fsPath;
        this.iconPath = new vscode.ThemeIcon('robot');
        this.command = {
            command: 'vscode.open',
            title: 'Open Sentinel',
            arguments: [this.resourceUri]
        };
    }
}

/**
 * Tree view provider for Missions
 */
class MissionTreeProvider implements vscode.TreeDataProvider<MissionItem> {
    getTreeItem(element: MissionItem): vscode.TreeItem {
        return element;
    }

    async getChildren(): Promise<MissionItem[]> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) return [];

        try {
            const files = await vscode.workspace.findFiles('test/*.intent.js');
            return files.map(f => new MissionItem(
                f.path.split('/').pop() || 'Unknown',
                f,
                vscode.TreeItemCollapsibleState.None
            ));
        } catch {
            return [];
        }
    }
}

class MissionItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly resourceUri: vscode.Uri,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(label, collapsibleState);
        this.tooltip = this.resourceUri.fsPath;
        this.iconPath = new vscode.ThemeIcon('rocket');
        this.contextValue = 'mission';
        this.command = {
            command: 'vscode.open',
            title: 'Open Mission',
            arguments: [this.resourceUri]
        };
    }
}

/**
 * Tree view provider for Hub Status
 */
class HubStatusProvider implements vscode.TreeDataProvider<StatusItem> {
    getTreeItem(element: StatusItem): vscode.TreeItem {
        return element;
    }

    getChildren(): StatusItem[] {
        return [
            new StatusItem('Status', hubConnection?.readyState === WebSocket.OPEN ? 'Connected' : 'Disconnected'),
            new StatusItem('URL', vscode.workspace.getConfiguration('starlight').get('hubUrl') || 'ws://localhost:8080'),
            new StatusItem('Browser', vscode.workspace.getConfiguration('starlight').get('browser') || 'chromium')
        ];
    }
}

class StatusItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly value: string
    ) {
        super(`${label}: ${value}`, vscode.TreeItemCollapsibleState.None);
        this.iconPath = new vscode.ThemeIcon('info');
    }
}
