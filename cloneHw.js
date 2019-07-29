const https = require('https');
const { spawn } = require('child_process');
const { students } = require('./students.json');

const args = process.argv.slice(2);
const repoName = args[0];
// const folderPath = args[1]; # ToDo: implement clone path destination

// If no repo specified in cli args, end
if(args.length === 0) { 
    console.log("No repository name supplied in arguments! Exiting...");
    process.exit();
}

// options object
const options = {
    hostname: 'api.github.com',
    path: `/repos/WDI-SEA/${repoName}/pulls`,
    method: 'GET',
    headers: {
        'User-Agent': 'h64'
    }  
}

// make xhr request
https.get(options, res => {
    res.setEncoding('utf8');
    let body = "";

    res.on('data', data => {
        body += data;
    })
    res.on('end', () => {
        body = JSON.parse(body);
        if(body.message) {
            console.error(`Error: Invalid repository name: ${repoName}`);
            process.exit(1);
        }
        cloneRepositories(getSubmittors(body));
    })
    res.on('error', err => {
        console.error("Error:", err);
    })
})

// find which students made submissions, and return that list as array
function getSubmittors(input) {
    const submissions = [];
    const usernames = students.map(({ username }) => username);
    for(pullRequest of input) {
        let idx = usernames.indexOf(pullRequest.user.login);
        if(idx > -1) { // PR confirmed submitted - add the student to the 'submitted' list
            let submissionDetails = students[idx];
            submissionDetails.repoPath = pullRequest.head.repo.full_name;;
            submissions.push(submissionDetails);
        }
    }
    return submissions;
}

// from the list, clone repositories
function cloneRepositories(submissions) {
    var cliCommand = `mkdir -p ${repoName}`; // start building the single, monolithic command
    submissions.forEach(submission => { // make dir of student's name, and clone into that directory
        cliCommand += ` && mkdir ${repoName}/${submission.name} && git clone git@github.com:${submission.repoPath}.git ${repoName}/${submission.name}`
    })

    const childProcess = spawn(cliCommand, { shell: true });

    childProcess.stdout.on('data', data => {
        console.log(data.toString().trim());
    })
    childProcess.stderr.on('data', data => {
        console.error(data.toString().trim());
    })
    childProcess.on('exit', exitCode => {
        console.log(generateMissingSubmissionsReport(submissions));
        console.log(`Done. ${submissions.length} / ${students.length} repositories cloned.`)
        // console.log("Child exited with code: " + exitCode);
    })
}

// print out which students didn't submit pull request submission
function generateMissingSubmissionsReport(submissions) {
    if(submissions.length === students.length) {
        return "";
    } else {
        let difference = students.filter(student => !submissions.includes(student));
        let names = "";
        difference.forEach(student => names += `${student.name} `);
        return `Missing submissions from: ${names}`;
    }
}