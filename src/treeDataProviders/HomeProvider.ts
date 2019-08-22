import * as vscode from "vscode";

class Home extends vscode.TreeItem {
    constructor(label: string,
        collapsibleState: vscode.TreeItemCollapsibleState,
        command?: vscode.Command
    ) {
        super(label, collapsibleState);
        this.command = command;
    }
}
// tslint:disable-next-line: max-classes-per-file
export class HomeProvider implements vscode.TreeDataProvider<Home> {

    constructor(private context: vscode.ExtensionContext) { }

    public getTreeItem(element: Home): vscode.TreeItem {
        return element;
    }
    public getChildren(element?: Home): vscode.ProviderResult<Home[]> {
        const options = [];
        options.push(new Home('Extension Features', vscode.TreeItemCollapsibleState.None,
            {
                title: 'Extension Features',
                command: 'extension.viewMarkdown',
                arguments: ['media/README.md']
            }));
        return options;
    }


}