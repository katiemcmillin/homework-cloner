const https = require("https");
const { spawn } = require("child_process");
const { students } = require("./students.json");

const orgs = ['WDI-SEA'] // Adjust Github orgs list here
const repoName = process.argv[2];

// If no repo specified in cli args, end program
if (process.argv.length === 0) {
    console.log("No repository name supplied in arguments! Exiting...");
    process.exit();
}

async function main() {
    let pullRequests = await Promise.all(orgs.map(org => xhr(org)))
    pullRequests = [].concat.apply([], pullRequests); // Flatten array of arrays
    pullRequests = pullRequests.filter(pr => pr.message != 'Not Found') // Strip empty PR, in the case of no PR from 2nd org

    let studentSubmissions = [];
    studentSubmissions = getStudentsPullRequests(pullRequests);
    await cloneRepositories(studentSubmissions)
    logMissingSubmissions(studentSubmissions);
}

// make xhr request
async function xhr(org) {
    const options = {
        hostname: "api.github.com",
        path: `/repos/${org}/${repoName}/pulls`,
        method: "GET",
        headers: {
            "User-Agent": "weston-bailey"
        }
    };
    return new Promise((resolve, reject) => {
        https.get(options, res => {
            res.setEncoding("utf8");
            let body = "";
        
            res.on("data", data => {
                body += data;
            });
            res.on("end", () => {
                body = JSON.parse(body);
                if (body.message) {
                    console.error(`Warning: No repository found for: ${org}/${repoName}`);
                }
                resolve(body);
            });
            res.on("error", err => {
                reject(new Error('Failed XHR, status code: ', res.statusCode))
            });
        });
    })
}


// find which students made submissions, and return that list as array
function getStudentsPullRequests(pullRequests) {
    const submissions = [];
    const usernames = students.map(({ username }) => username);
    for (pullRequest of pullRequests) {
        // If this student already submitted HW in multiple orgs - don't include dupe submission from other org
        // This also implicitly makes a preference on one PR over another in the case of dupes
        // The chance of this actually coming up and being a problem is very small - just clone it manually at that point

        let username = pullRequest.user.login;
        if (submissions.indexOf(username) > -1) { continue } ; 
        // disallow PR from branches -- uncomment to skip all except specific branch names
        // if (pullRequest.head.ref !== 'main' && pullRequest.head.ref !== 'master' ) { continue } ; 
        
        let idx = usernames.indexOf(pullRequest.user.login);
        if (idx > -1) {
            // PR confirmed submitted - add the student to the 'submitted' list
            // let submissionDetails = students[idx];
            // submissionDetails.repoPath = pullRequest.head.repo.full_name;
            submissions.push(pullRequest);
        }
    }
    return submissions;
}

// from the list, clone repositories
async function cloneRepositories(submissions) {
    // BASH scripting magic: If folder not present - mkdir and clone, else echo message
    // $1: studentName, $2: repoPath, $3: orgName
    let bashFunction = 
    `hw() { 
        if [ ! -d "$1" ] ; then
            mkdir "$1";
            git clone -q git@github.com:$2.git $1;
            echo "Cloning into '${repoName}/$1' from $3"
        else
            echo "$1: directory already on drive"
        fi
    }`

    // mkdir if doesn't exist and cd
    var cliCommand = `${bashFunction} && mkdir -p ${repoName} && cd ${repoName}`; 
    submissions.forEach(submission => {
        let githubUsername = submission.user.login;
        let studentName = students.find(student => student.username == githubUsername).name;
        let repoPath = submission.head.repo.full_name;
        let orgName = submission.base.user.login;

        cliCommand += ` && hw ${studentName} ${repoPath} ${orgName}`
    });

    const childProcess = spawn(cliCommand, { shell: true });

    childProcess.stdout.on("data", data => {
        console.log(data.toString().trim());
    });
    childProcess.stderr.on("data", data => {
        console.error(data.toString().trim());
    });
    const exitCode = await new Promise((resolve, reject) => {
        childProcess.on('close', resolve);
    });
}


// print out which students didn't submit pull request submission
function logMissingSubmissions(submissions) {
    if (submissions.length !== students.length) {
        let githubUsernames = submissions.map(submission => submission.user.login) //array of github usernames that made submission
        let difference = students.filter(student => !githubUsernames.includes(student.username)); //array of students that didnt make submission

        let names = "";
        difference.forEach(student => (names += `${student.name} `));
        console.log(`Missing submissions from: ${names}`);
    }
}

main();