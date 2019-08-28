import * as _ from 'lodash';
import axios from 'axios';
import * as constants from '../constants';
import * as fs from 'fs';
import * as path from 'path';
import ignore, { Ignore } from 'ignore';
import * as jwt from 'jsonwebtoken';
import * as archiver from 'archiver';
import packConfig from '../config/packs';
import submissionApi = require('@topcoder-platform/topcoder-submission-api-wrapper');
const submissionApiClient = submissionApi({
  SUBMISSION_API_URL: constants.uploadSubmmissionUrl
});
/**
 * Interacts with challenges APIs
 */
export default class ChallengeService {

  /**
   * Gets the details of a submission
   * @param challengeId challenge identifier
   * @param token user token
   */
  public static async getSubmissionDetails(challengeId: string, token: string) {
    const decodedToken: any = jwt.decode(token);
    const url = constants.memberSubmissionUrl
      .replace('{challengeId}', challengeId)
      .replace('{memberId}', decodedToken.userId);

    try {
      const { data } = await axios.get(url,
        {
          headers: { Authorization: `Bearer ${token}` }
        });
      return data;
    } catch (err) {
      throw new Error(constants.loadSubmissionFailed);
    }
  }

  /**
   * Get the artifacts in a submission
   * @param submissionId submission identifier
   * @param token user token
   */
  public static async getSubmissionArtifacts(submissionId: string, token: string) {
    const url = constants.submissionArtifactsUrl.replace('{submissionId}', submissionId);

    try {
      const { data } = await axios.get(url,
        {
          headers: { Authorization: `Bearer ${token}` }
        });
      return data;
    } catch (err) {
      throw new Error(constants.loadSubmissionFailed);
    }
  }

  /**
   * Generate html page content from reviews and artifacts
   * @param reviews the reviews with artifacts
   * @return the html page content
   */
  public static generateReviewArtifactsHtml(reviews: any) {
    return `<!doctype html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${constants.submissionDetailsPageTitle}</title>
        <style>
            td {
              padding: 10px;
            }
            th {
              /* Invert background and foreground for table header*/
              background-color: var(--vscode-editor-foreground) !important;
              color: var(--vscode-editor-background) !important;
              padding: 10px;
            }
        </style>
      </head>
      <body>
      <h2>Reviews</h2>
        <table border="1" style="margin-bottom: 40px">
          <tr>
            <th>Score</th>
            <th>Created at</th>
          </tr>
          ${this.generateHtmlTableFromReviews(reviews)}
        </table>
        ${this.generateArtifactsUnorderedList(reviews)}
        <script>
        // enable communication with the extension via messaging.
        var vscode;

        (function () {
          vscode = acquireVsCodeApi();
        }());

        function downloadArtifact(submissionId, artifactId) {
          if (submissionId && artifactId) {
            vscode.postMessage({
              action: '${constants.webviewMessageActions.DOWNLOAD_ARTIFACT}',
              data: {
                submissionId,
                artifactId
              }
            });
          }
        }
      </script>
      </body>
      </html>`;
  }

  /**
   * Gets the stream to download to disk an artifact
   * @param submissionId Submission identifier
   * @param artifactId Artifact identifier
   * @param token User token
   */
  public static async downloadArtifact(submissionId: string, artifactId: string, token: string) {
    const url = constants.downloadSubmissionUrl
      .replace('{submissionId}', submissionId)
      .replace('{artifactId}', artifactId);
    try {
      const { data } = await axios.get(url,
        {
          headers: { Authorization: `Bearer ${token}` },
          responseType: 'stream'
        });
      return data;
    } catch (err) {
      throw new Error(constants.artifactDownloadFailed);
    }
  }

  /**
   * Get the list of current active challenges.
   * @param savedToken
   * @return The challenges.
   */
  public static async getActiveChallenges(savedToken: string) {
    try {
      const { data } = await axios.get(constants.activeChallengesUrl,
        {
          headers: { Authorization: `Bearer ${savedToken}` }
        });
      return data;
    } catch (err) {
      throw new Error(constants.loadOpenChallengesFailedMessage);
    }
  }

  /**
   * Generate html page content from challenges
   * @param challenges the challeges
   * @return the html page content
   */
  public static generateHtmlFromChallenges(challenges: any[]): string {
    return `<!doctype html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${constants.challengesPageTitle}</title>
      </head>
      <body>
        <table border="1" style="margin-bottom: 40px">
          <tr>
            <th>Challenge Name</th>
            <th>Challenge Type</th>
            <th>Number of registrants</th>
            <th>Prizes</th>
            <th>Current Phase</th>
          </tr>
          ${this.generateHtmlTableFromChallenges(challenges)}
        </table>
        <script>
          // enable communication with the extension via messaging.
          var vscode;

          (function () {
            vscode = acquireVsCodeApi();
          }());

          function openChallenge(challengeId) {
            if (challengeId) {
              vscode.postMessage({
                action: '${constants.webviewMessageActions.DISPLAY_CHALLENGE_DETAILS}',
                data: {
                  challengeId
                }
              });
            }
          }
        </script>
      </body>
      </html>`;
  }

  /**
   * Get the details of a valid challenge
   * @param challengeId - The id of the challenge
   * @param savedToken - A valid user auth token
   * @return The challenge details
   * @throws if challenge does not exist
   */
  public static async getChallengeDetails(challengeId: string, savedToken: string) {
    try {
      const url = `${constants.challengeDetailsUrl}/${challengeId}`;
      const { data } = await axios.get(url, {
        headers: { Authorization: `Bearer ${savedToken}` }
      });
      return data;
    } catch (e) {
      throw new Error(constants.challengeNotFound);
    }
  }

  /**
   * Construct HTML for display based on the challenge details available
   * @param challengeDetails Challenge details object
   * @return The HTML string of challenge details.
   */
  public static generateHtmlFromChallengeDetails(challengeDetails: any, userToken: string): string {
    return `
      <!doctype html>
      <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>${constants.challengeDetailsPageTitle}</title>
          <style>
            td {
              padding-left: 3px;
            }
            th {
              /* Invert background and foreground for table header*/
              background-color: var(--vscode-editor-foreground) !important;
              color: var(--vscode-editor-background) !important;
            }
            button {
              background: #0681ff;
              width: 220px;
              color: white;
              border-color: transparent;
              cursor: pointer;
              height: 28px;
              border-radius: 4px;
            }
            #specifications span, #submission-guidelines span {
              /* Override inline styles */
              background-color: var(--vscode-editor-background) !important;
              color: var(--vscode-editor-foreground) !important;
            }
            .workspaceBtns {
              display: none;
            }
            .workspaceBtns.visible {
              display: block;
            }
          </style>
        </head>
        <body>
          <script>
            // enable communication with the extension via messaging.
            var vscode;

            (function () {
              vscode = acquireVsCodeApi();
            }());

            /**
             * Register user for the selected challenge
             */
            function registerForChallenge(challengeId){
              if(challengeId){
                vscode.postMessage({
                  action: '${constants.webviewMessageActions.REGISTER_FOR_CHALLENGE}',
                  data: {
                    challengeId
                  }
                });
              }
            }

            /**
             * Initialize the current workspace
             */
            function initializeWorkspace(challengeId){
              if(challengeId){
                vscode.postMessage({
                  action: '${constants.webviewMessageActions.INITIALIZE_WORKSPACE}',
                  data: {
                    challengeId
                  }
                });
              }
            }

            /**
             *  Launches action to ask user if we wants to use a starter pack
             */
            function cloneStarterPack(filter, challengeId) {
              vscode.postMessage({
                action: '${constants.webviewMessageActions.CLONE_STARTER_PACK}',
                data: {
                  filter,
                  challengeId,
                }
              });
            }

            /**
             * Show the workspace buttons that are hidden by default
             */
            function showWorkspaceButtons() {
              var buttons = document.getElementsByClassName('workspaceBtns');
              Array.from(buttons).forEach(
                function(navDom) {
                  navDom.classList.add('visible')
                });
            }

            // Handle message from extension to this webview.
            window.addEventListener('message', event => {
                const message = event.data;
                switch (message.command) {
                    case '${constants.webviewMessageActions.REGISTERED_FOR_CHALLENGE}':{
                      document.getElementById('registerButton').remove();
                      showWorkspaceButtons();
                    } break;
                }
            });
            // wait for window to load completely
            window.addEventListener('load', () => {
                if(!document.getElementById('registerButton')) {
                  showWorkspaceButtons();
                }
            });
          </script>
          <h1>${challengeDetails.challengeTitle}</h1>
          ${this.generateRegisterButtonHTML(challengeDetails, userToken)}
          ${this.generateInitWorkspaceButtonHtml(challengeDetails)}
          ${this.generateCloneStarterPackButtonHtml(challengeDetails)}
          <h2>Prizes</h2>
          <div>${this.generateHtmlFromChallengePrizes(challengeDetails.prizes)}</div>
          <h2>Meta</h2>
          <div>${this.generateMetaTableFromChallengeDetails(challengeDetails)}</div>
          <h2>Specification</h2>
          <div id='specifications'>${challengeDetails.detailedRequirements || challengeDetails.introduction}</div>
          <h2>Submission Guidelines</h2>
          <div id='submission-guidelines'>${challengeDetails.finalSubmissionGuidelines || 'N/A'}</div>
        </body>
      </html>`;
  }

  /**
   * Register this user for the given challenge
   * @param challengeId The ID of the challenge to register to
   * @param userToken The valid user JWT token
   */
  public static async registerUserForChallenge(challengeId: string, userToken: string) {
    try {
      return await axios.post(constants.challengeRegistrationUrl.replace('{challengeId}', challengeId), undefined, {
        headers: {
          'Authorization': `Bearer ${userToken}`,
          'Content-Type': 'application/json'
        }
      });
    } catch (err) {
      throw new Error(constants.registrationFailedMessage);
    }
  }

  /**
   * Submit the workspace to topcoder challenge
   * @param savedToken
   * @param workspacePath
   * @return the response of submit endpoint
   */
  public static async uploadSubmmission(savedToken: string, workspacePath: string): Promise<any> {
    if (!workspacePath) {
      throw new Error(constants.emptyWorkspaceToSubmit);
    }
    if (!fs.existsSync(path.join(workspacePath, '.topcoderrc'))) {
      throw new Error(constants.missTopcoderrcFile);
    }
    const rcContent = fs.readFileSync(path.join(workspacePath, '.topcoderrc'), 'utf-8');
    let challengeId = '';
    try {
      challengeId = JSON.parse(rcContent).challengeId;
      if (typeof challengeId === 'number') {
        challengeId = challengeId + '';
      }
    } catch (err) {
      throw new Error(constants.inCorrectFormatTopcoderrc);
    }
    if (typeof challengeId !== 'string' || !(challengeId.trim())) {
      throw new Error(constants.missChallengeId);
    }
    /* First validate if user can submit: */
    // get challenge details if challenge exists
    const challengeDetails = await this.getChallengeDetails(challengeId, savedToken);
    // check if this user has registered for this challenge
    const decodedToken: any = jwt.decode(savedToken);
    const registrants: any[] = _.get(challengeDetails, 'result.content.registrants', []);
    const hasUserRegistered = registrants.find((profile) => profile.handle === decodedToken.handle) !== undefined;
    if (!hasUserRegistered) {
      throw new Error(constants.userNotRegisteredForChallenge);
    }
    // check if this challenge is open for submission
    const phases: any[] = _.get(challengeDetails, 'result.content.phases', []);
    const isChallengeOpenForSubmission = phases.find((phase) => phase.type === 'Submission'
      && phase.status === 'Open') !== undefined;
    if (!isChallengeOpenForSubmission) {
      throw new Error(constants.submissionPhaseNotOpen);
    }
    /* Proceed with submission */
    const ig = ignore();
    if (fs.existsSync(path.join(workspacePath, '.gitignore'))) {
      // load the .gitignore and add .git folder
      ig.add(fs.readFileSync(path.join(workspacePath, '.gitignore')).toString()).add('.git');
    } else {
      // always ignore .git folder
      ig.add('.git');
    }
    // get all files which not ignored
    const filesToSubmit = this.listAllFilesInDir(workspacePath, workspacePath, ig);
    // zip all files and save to local temp file
    const zipFilePath = path.join(workspacePath, 'submit.zip');
    await this.zipFiles(workspacePath, filesToSubmit, zipFilePath);
    // submit the file to topcoder endpoint
    let response;
    try {
      response = await this.submitFileToChallenge(zipFilePath, challengeId, savedToken);
    } catch (e) {
      throw new Error(constants.challengeSubmissionFailedMessage);
    } finally {
      // delete the zip local temp file
      if (fs.existsSync(zipFilePath)) {
        fs.unlinkSync(zipFilePath);
      }
    }
    return response;
  }

  /**
   * Retrieve the list of active challenges for the given user.
   * @param token The user JWT
   */
  public static async getActiveChallengesOfUser(token: string) {
    try {
      const profile: any = jwt.decode(token);
      const url = constants.memberChallengesUrl.replace('{memberId}', profile.handle);
      const { data } = await axios.get(url, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      return _.get(data, 'result.content');
    } catch (err) {
      throw new Error(constants.userChallengesLoadFailedMessage);
    }
  }

  /**
   * Initialize the current workspace at the root folder with a .topcoderrc file
   * @param workspacePath The current workspacePath
   * @param challengeId The challenge id to write to the .topcoderrc file
   */
  public static async initializeWorkspace(workspacePath: string, challengeId: string) {
    return new Promise((resolve, reject) => {
      fs.writeFile(path.join(workspacePath, '.topcoderrc'), JSON.stringify({
        challengeId: `${challengeId}`
      }), (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Generate html table content from challenges
   * @param challenges the challeges
   * @return the html table content
   */
  private static generateHtmlTableFromChallenges(challenges: any[]): string {
    return challenges
      .map((challenge: any) => {
        const filteredPhases = _.filter(challenge.currentPhases, (item) => item.phaseStatus === 'Open');
        return `<tr>
                  <td><a href='#' onclick='openChallenge(${challenge.id})'>${challenge.name}</a></td>
                  <td>${challenge.subTrack}</td>
                  <td>${challenge.numRegistrants}</td>
                  <td>${_.join(_.map(challenge.prizes, (x) => `\$${x}`), ', ')}</td>
                  <td>${_.join(_.map(filteredPhases, 'phaseType'), ', ')}</td>
                </tr>`;
      })
      .join('');
  }

  /**
   * Get all files list in the workspace which not ignored
   * @param workspaceRootDir the workspace path to submit
   * @param currentDir current directory
   * @param ig the ignore instance
   * @return the files list
   */
  private static listAllFilesInDir(workspaceRootDir: string, currentDir: string, ig: Ignore): string[] {
    let results: string[] = [];
    fs.readdirSync(currentDir).forEach((file) => {
      file = path.join(currentDir, file);
      const stat = fs.statSync(file);
      if (stat && stat.isDirectory()) {
        if (!ig.ignores(path.relative(workspaceRootDir, file))) {
          results = results.concat(this.listAllFilesInDir(workspaceRootDir, file, ig));
        }
      } else {
        if (!ig.ignores(path.relative(workspaceRootDir, file))) {
          results.push(file);
        }
      }
    });
    return results;
  }

  /**
   * Zip all files
   * @param workspaceRootDir the workspace path to submit
   * @param filesToZip the files to zip
   * @param zipFilePath zip file path
   */
  private static async zipFiles(workspaceRootDir: string, filesToZip: string[], zipFilePath: string) {
    return new Promise((resolve, reject) => {
      const output = fs.createWriteStream(zipFilePath);
      const archive = archiver('zip');
      // listen for all archive data to be written
      output.on('close', () => resolve());
      archive.on('warning', (warning) => console.log(`zip workspace warning: ${warning.toString()}`));
      archive.on('error', (err) => {
        console.log(`zip workspace error: ${err.toString()}`);
        reject(err);
      });
      // pipe archive data to the file
      archive.pipe(output);
      // append files from stream
      filesToZip.forEach((file) => {
        archive.append(fs.createReadStream(file), { name: path.relative(workspaceRootDir, file) });
      });
      // finalize the archive
      archive.finalize();
    });
  }

  /**
   * Submit the file to topcoder challenge
   * @param filePath the file path
   * @param challengeId the challenge id
   * @param savedToken the token
   * @return the response of submit endpoint
   */
  private static async submitFileToChallenge(filePath: string, challengeId: string, savedToken: string): Promise<any> {
    const decodedToken: any = jwt.decode(savedToken);
    const submissionData = {
      submission: {
        name: path.basename(filePath),
        data: fs.createReadStream(filePath)
      },
      type: constants.submitType,
      challengeId,
      memberId: decodedToken.userId
    };
    return await submissionApiClient.createSubmission(submissionData, savedToken);
  }

  /**
   * Generate an HTML table from the list of prize amounts
   * @param prizes An array of prize amounts
   * @return HTML string containing table information.
   */
  private static generateHtmlFromChallengePrizes(prizes: number[]) {
    const tableHtml = _.map(prizes, (prize, i) => {
      return {
        header: `<th>${this.getOrdinalNumber(i + 1)} Place</th>`,
        row: `<td>$${prize}</td>`
      };
    });
    return `
      <table border='1px'>
        <tr>
          ${_.join(_.map(tableHtml, (data) => data.header), '')}
        </tr>
        <tr>
          ${_.join(_.map(tableHtml, (data) => data.row), '')}
        </tr>
      </table>
    `;

  }

  /**
   * Generates an HTML table from the challenge details object
   * to display the current challenge phase, number of registrants and submissions.
   * @param challengeDetails The challenge details object from the server
   * @return HTML string containing table information.
   */
  private static generateMetaTableFromChallengeDetails(challengeDetails: any): string {
    return `
      <table border='1px'>
        <tr>
          <th>Current Phase</th>
          <th># of Registrants</th>
          <th># of Submissions</th>
        </tr>
        <tr>
          <td>${challengeDetails.currentStatus || 'N/A'}</td>
          <td>${challengeDetails.numberOfRegistrants || '0'}</td>
          <td>${challengeDetails.numberOfSubmissions || '0'}</td>
        </tr>
      </table>
    `;
  }

  /**
   * Converts numeric values for ex:1,2,3 into their ordinal representations ex: 1st, 2nd, 3rd
   * @param place Number denoting the rank/index of an item
   * @return Ordinal number representation
   */
  private static getOrdinalNumber(place: number): string {
    const remainder = place % 10;
    switch (remainder) {
      case 1: return `${place}st`;
      case 2: return `${place}nd`;
      case 3: return `${place}rd`;
      default: return `${place}th`;
    }
  }

  /**
   * Returns the html to display for the register button, if user has not already registered.
   * @param challengeDetails The challenge details
   * @param userToken The user token
   */
  private static generateRegisterButtonHTML(challengeDetails: any, userToken: string) {
    const buttonHtml = `
      <button id="registerButton" onclick='registerForChallenge(${challengeDetails.challengeId})'>
        Register
      </button>
      `;
    // add register button to DOM only if this user has not already registered
    const registrants: any[] = _.get(challengeDetails, 'registrants', []);
    const decodedToken: any = jwt.decode(userToken);
    const registerEnabled = registrants.find((profile) => profile.handle === decodedToken.handle) === undefined
      && this.isApplyPhase(challengeDetails);
    return registerEnabled ? buttonHtml : '';
  }

  /**
   * Checks if a challenge can have action to register
   * @param challengeDetails The challenge details
   */
  private static isApplyPhase(challengeDetails: any) {
    return challengeDetails.currentPhaseName === 'Submission' || challengeDetails.currentPhaseName === 'Registration';
  }

  /**
   * Returns the html to display the button that will initialize the current workspace for submission
   * @param challengeDetails The challenge details
   */
  private static generateInitWorkspaceButtonHtml(challengeDetails: any) {
    return this.isApplyPhase(challengeDetails) ? `
    <button class="workspaceBtns" onclick='initializeWorkspace(${challengeDetails.challengeId})'>
      Initialize Workspace
    </button>` : '';
  }

  /**
   * Returns the html to display the button that will ask the user to initialize the current
   * workspace with a specific starter pack
   * @param challengeDetails The challenge details
   */
  private static generateCloneStarterPackButtonHtml(challengeDetails: any) {
    const filter = packConfig.filter((x: any) =>
      challengeDetails.technologies.some((y: string) => x.name.toLowerCase() === y.toLowerCase()));

    return filter.length > 0 && this.isApplyPhase(challengeDetails) ? `
    <button class="workspaceBtns" style="margin-top:10px"
      onclick='cloneStarterPack(${JSON.stringify(filter)}, ${challengeDetails.challengeId})'>
      Clone starter pack
    </button>` : '';
  }

  /**
   * Generate the html to show artifacts in an unordered list
   * @param reviews reviews with artifacts
   */
  private static generateArtifactsUnorderedList(reviews: any) {
    // get all the reviews which contains artifacts
    const filtered = reviews.filter((review: any) => !_.isEmpty(review.artifacts))
      .map((t: any) => ({ id: t.id, artifacts: t.artifacts }));

    // just show artifacts section in case they exist
    if (!_.isEmpty(filtered)) {
      return `<h2>Artifacts</h2>
      <ul>
        ${_.flatten(filtered.map((f: any) =>
        (f.artifacts.map((artifact: any) =>
          (`<li style="margin-top:10px"><a href='#' onclick='downloadArtifact("${f.id}", "${artifact}")'>${artifact}</a></li>`)).join('')
        )
      ))}
      </ul>`;
    }
    return '';
  }

  /**
   * Generate reviews table
   * @param reviews reviews with artifacts
   */
  private static generateHtmlTableFromReviews(reviews: any) {
    return reviews.map((review: any) => {
      return `<tr>
                  <td>${review.score}</td>
                  <td>${review.created}</td>
                </tr>`;
    }).join('');
  }

}
