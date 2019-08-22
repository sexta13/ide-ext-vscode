import * as vscode from 'vscode';
import AuthService from '../services/AuthService';
import ChallengeService from '../services/ChallengeService';
import * as constants from '../constants';
import * as _ from 'lodash';


class Challenge extends vscode.TreeItem {
    constructor(label: string,
        collapsibleState: vscode.TreeItemCollapsibleState,
        command?: vscode.Command
    ) {
        super(label, collapsibleState);
        this.command = command;
    }
}

// tslint:disable-next-line: max-classes-per-file
export class ChallengeProvider implements vscode.TreeDataProvider<Challenge> {

    constructor(private context: vscode.ExtensionContext) { }

    public async getChildren(challenge?: Challenge): Promise<Challenge[]> {
        try {
            const token = await AuthService.getToken();
            const config = vscode.workspace.getConfiguration(constants.extensionConfigSectionName);
            const username = config.get(constants.usernameConfig) as string;
            const res = await ChallengeService.getMemberActiveChallenges(token, username);
            const challenges = _.get(res, 'result.content', []);
            return challenges.map((challenge: any) =>
                new Challenge(challenge.name,
                    vscode.TreeItemCollapsibleState.None,
                    { command: 'extension.viewChallengeDetail', title: 'View', arguments: [challenge.id] }));
        } catch (err) {
            return [new Challenge(err.message, vscode.TreeItemCollapsibleState.None, undefined)];
        }

    }

    public getTreeItem(challenge: Challenge): vscode.TreeItem {
        return challenge;
    }
}
