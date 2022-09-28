const https = require("https")
const readLine = require('readline')
const { spawn } = require("child_process")

const {
    existsSync,
    readFileSync,
    writeFileSync
} = require('fs')

const {
    students,
    githubToken,
    userName,
    hostname,
    orgs
} = require("./config.json")

// color escape codes
const colors = {
    reset: "\033[0m",
    fgRed: "\033[31m",
    fgYellow: "\033[33m",
    fgGreen: "\033[32m",
    fgBlue: "\033[34m",
    error: str => `${colors.fgRed}${str}${colors.reset}`,
    warn: str => `${colors.fgYellow}${str}${colors.reset}`,
    success: str => `${colors.fgGreen}${str}${colors.reset}`,
    info: str => `${colors.fgBlue}${str}${colors.reset}`,
}

// functions for console colors
const {
    error,
    warn,
    info,
    success
} = colors

// match command flags that start with --
const flags = process.argv.filter(argv => argv.match(/(?<!\w)--\w+/))
// to check if an org has the repo
const orgChecks = orgs

// the repo name should be the first arg to the script
async function main(repoName = process.argv[2]) {
    // If no repo specified in cli args, end program
    if (!repoName) {
        console.log(`${error('No arguments to evaluate!')}\nExiting...`)
        process.exit()
    }

    // check if the finished-assignments.json exists, if not, create it
    if (!existsSync('./finished-assignments.json')) {
        console.log(warn('./finished-assignments.json not found, creating it now...'))
        createFinishedJson()
    }

    // forego cloning if one of the following flags is found
    if (flags.includes('--check')) return checkSubmissions()
    if (flags.includes('--forget')) return forgetRepo(repoName)
    if (flags.includes('--list')) return listAssignments()
    if (flags.includes('--sync')) return syncStudents()
    if (flags.includes('--updateAll')) return updateAll()
    if (flags.includes('--completed')) return completed(repoName, process.argv[3])
    if (flags.includes('--allCompleted')) return allCompleted(repoName)

    return cloneHw(repoName)
}

async function cloneHw(repoName) {
    let pullRequests = await Promise.all(orgs.map(org => xhr(org, repoName)))
    // Flatten array of arrays
    pullRequests = [].concat.apply([], pullRequests)
    // Strip empty PR, in the case of no PR from 2nd org
    pullRequests = pullRequests.filter(pr => pr.message != 'Not Found')
    // pullRequests.forEach(pullRequest => {
    //   console.log(pullRequest.number, pullRequest.user)
    // })

    let studentSubmissions = []
    studentSubmissions = getStudentsPullRequests(pullRequests)
    await cloneRepositories(studentSubmissions, repoName)
    // only update finished assignments if the --noTrack flag isn't found
    if (!flags.includes('--noTrack')) {
        addNewAssigment(repoName)
        updateFinishedAssignments(studentSubmissions, repoName)
        console.log(info(`Tracking submissions for ${repoName}!`))
    } else {
        console.log(info(`Not tracking the submissions! for ${repoName}`))
    }
    logMissingSubmissions(studentSubmissions)
}

// make xhr request
async function xhr(org, repoName) {
    // the enterprise api url is different grrr....
    const apiUrl = hostname === "git.generalassemb.ly" ? "/api/v3/repos" : "/repos"
    const options = {
        hostname, // "git.generalassemb.ly" || "api.github.com"
        path: `${apiUrl}/${org}/${repoName}/pulls?per_page=100`,
        method: "GET",
        headers: {
            "User-Agent": userName,
            "Authorization": `token ${githubToken}`
        }
    }

    return new Promise((resolve, reject) => {
        https.get(options, res => {
            res.setEncoding("utf8")
            let body = ""

            res.on("data", data => {
                body += data
            })
            res.on("end", async () => {
                body = JSON.parse(body)
                if (body.message) {
                    console.log(error(body.message))
                    // if its not already been found to not have the repo
                    if (orgChecks[orgs.indexOf(org)]) {

                        console.error(error(`Warning: No repository found for: ${org}/${repoName}`))
                        orgChecks[orgs.indexOf(org)] = false
                    }

                    if (orgChecks.every(org => !org)) {
                        console.log(error(`Warning: None of the orgs have a repo named ${repoName}!`))
                        console.log(info('exiting...'))
                        process.exit()
                    }
                    // await quitOrContinue()
                }
                resolve(body)
            })
            res.on("error", err => {
                reject(new Error(error('Failed XHR, status code: '), res.statusCode))
            })
        })
    })
}

// wait for user input -- user input is returned and made lowercase with the boolean
function prompt(query, lowerCase = false) {
    const rl = readLine.createInterface({
        input: process.stdin,
        output: process.stdout,
    })

    return new Promise(resolve => rl.question(query, ans => {
        rl.close();
        if (lowerCase) ans = ans.toLocaleLowerCase()
        resolve(ans);
    }))
}

// a funciton that asks the user if they would like to exit of not
const affirmative = ['y', 'yes']
const negative = ['n', 'no']

async function quitOrContinue() {
    const cont = await prompt(warn('Would you like to continue anyway? (y/n)\n>', true))
    if (affirmative.includes(cont)) {
        console.log(info('continuing...'))
        return true
    }
    if (negative.includes(cont)) {
        console.log(info('exiting...'))
        return process.exit()
    }
    console.log(error('I did not understand that, please answer y/n.'))
    return quitOrContinue()
}

// find which students made submissions, and return that list as array
function getStudentsPullRequests(pullRequests) {
    const submissions = []
    const usernames = students.map(({ username }) => username)
    for (pullRequest of pullRequests) {
        // If this student already submitted HW in multiple orgs - don't include dupe submission from other org
        // This also implicitly makes a preference on one PR over another in the case of dupes
        // The chance of this actually coming up and being a problem is very small - just clone it manually at that point

        let username = pullRequest.user.login
        if (submissions.indexOf(username) > -1) { continue }
        // disallow PR from branches -- uncomment to skip all except specific branch names
        // if (pullRequest.head.ref !== 'main' && pullRequest.head.ref !== 'master' ) { continue }   

        let idx = usernames.indexOf(pullRequest.user.login)
        if (idx > -1) {
            // PR confirmed submitted - add the student to the 'submitted' list
            // let submissionDetails = students[idx] 
            // submissionDetails.repoPath = pullRequest.head.repo.full_name 
            submissions.push(pullRequest)
        }
    }
    return submissions
}

// from the list, clone repositories
async function cloneRepositories(submissions, repoName) {
    // BASH scripting magic: If folder not present - mkdir and clone, else echo message
    // $1: studentName, $2: repoPath, $3: orgName
    // OG bash function that doesn't reclone when a folder is found
    let msg = warn('directory already on drive')
    const clonePath = hostname === 'api.github.com' ? 'github.com' : hostname
    let bashFunction =
        `hw() { 
			if [ ! -d "$1" ] ;  then
			mkdir "$1" 
			echo "Cloning into '${repoName}/$1' from $3"
			git clone -q git@${clonePath}:$2.git $1 
			else
			echo "$1: ${msg}"
			fi
		}`

    // deleted found repos if the --overWrite flag is used
    if (flags.includes('--overWrite')) {
        msg = warn('directory already on drive, deleting...')
        console.log(warn('overwriting existing cloned repos...'))

        bashFunction =
            `hw() { 
				# check if folder exists
				if [ -d "$1" ] ; then
					echo "$1: ${msg}"
					rm -rf "$1" 
				fi
			
				# clone down repo
				mkdir "$1" 
				echo "Cloning into '${repoName}/$1' from $3"
				git clone -q git@${clonePath}:$2.git $1 
			}`
    }

    // mkdir if doesn't exist and cd
    let cliCommand = `${bashFunction} && mkdir -p ${repoName} && cd ${repoName}`
    submissions.forEach(submission => {
        let githubUsername = submission.user.login
        let studentName = students.find(student => student.username == githubUsername).name
        let repoPath = submission.head.repo.full_name
        let orgName = submission.base.user.login

        cliCommand += ` && hw ${studentName} ${repoPath} ${orgName}`
    })

    const childProcess = spawn(cliCommand, { shell: true })

    childProcess.stdout.on("data", data => {
        console.log(data.toString().trim())
    })
    childProcess.stderr.on("data", data => {
        console.error(error(data.toString().trim()))
    })
    const exitCode = await new Promise((resolve, reject) => {
        childProcess.on('close', resolve)
    })
}

// print out which students didn't submit pull request submission
function logMissingSubmissions(submissions) {
    // log missing students to update course tracker
    const numColor = submissions.length < students.length ? error : success
    console.log(numColor(`${submissions.length} of ${students.length}`), `added to finished-assignments.json.`)
    if (submissions.length !== students.length) {
        //array of github usernames that made submission
        let githubUsernames = submissions.map((submission) => submission.user.login)
        //array of students that didnt make submission
        let difference = students.filter((student) => !githubUsernames.includes(student.username))

        let names = ''
        difference.forEach((student) => (names += `${student.name}\n`))
        console.log(error(`Missing submissions from:\n${names}\n`))
    }
}

// adds new assignment to the finished assignments json (does not add if it is not new)
function addNewAssigment(repoName) {
    const finishedJson = JSON.parse(readFileSync('finished-assignments.json'))
    if (!finishedJson.assignments.includes(repoName)) {
        finishedJson.assignments.push(repoName)
        writeFileSync('./finished-assignments.json', JSON.stringify(finishedJson))
    }
}

// adds assignment and student submissions to json
function updateFinishedAssignments(submissions, repoName) {
    //array of github usernames that made submission
    const githubUsernames = submissions.map(submission => submission.user.login)
    const finishedJson = JSON.parse(readFileSync('finished-assignments.json'))
    finishedJson.students.forEach(student => {
        // only add if a submission is found
        if (githubUsernames.includes(student.username)) {
            // do not add duplicates
            if (!student.completed.includes(repoName)) student.completed.push(repoName)
        }
    })
    writeFileSync('./finished-assignments.json', JSON.stringify(finishedJson))
}

// creates the json that tracks turned in deliverbles
function createFinishedJson() {
    const finishedObj = {
        assignments: [],
        students: students.map(student => {
            return { ...student, completed: [] }
        })
    }
    writeFileSync('./finished-assignments.json', JSON.stringify(finishedObj))
}

// promisify the spawn untility
function spawnAsync(command) {
    return new Promise((resolve, reject) => {
        const childProcess = spawn(command, { shell: true })
        childProcess.stdout.on('data', data => console.log(data.toString().trim()))
        childProcess.stderr.on('data', data => reject(error(data.toString().trim())))
        childProcess.on('close', code => resolve(code))
    })
}

/**
 * Flag Functions: 
 * these are invoked instead of cloneHw if the corresponding flag in present 
 * in the cli args
 */

// --check: checks submissions in finished-assignments.json
function checkSubmissions() {
    const finishedJson = JSON.parse(readFileSync('finished-assignments.json'))
    // less than or equal to this will appear yellow 
    const yellowPercent = 85
    // less than this will appear red
    const redPercent = 80
    // will print a message if --noGreen is flagged and there are none to print
    let noWarns = true
    // loop over each student and compare their completed with the assignments to calculate missing
    finishedJson.students.forEach(student => {
        const missing = []
        let missingString = ''
        finishedJson.assignments.forEach(assignment => {
            if (!student.completed.includes(assignment)) {
                missing.push(assignment)
                // FIXME: If used with more than one organization, works well for seir-flex-831
                const organization = orgs[0]
                missingString += `github.com/${organization}/${assignment}\n`
            }
        })
        // calculate missing percentage
        const percent = Math.round((finishedJson.assignments.length - missing.length) * 100 / finishedJson.assignments.length)
        // print student name and missing assigments
        const color = percent < redPercent ? error :
                      percent <= yellowPercent ? warn :
                      success
        const msg = `${student.name}\n${missing.length} missed assignments:\n${missingString}\ncompletion rate: ${percent}%`
        if (flags.includes('--noGreen')) {
            if (percent < yellowPercent) {
                noWarns = false
                console.log('-----\n')
                console.log(color(msg))
                console.log('\n-----')
            }
        } else {
            noWarns = false
            console.log('-----\n')
            console.log(color(msg))
            console.log('\n-----')
        }
    })
    // message if no warnings where found
    if (noWarns) console.log(success('Only green students found!'))
}

// --forget: removes the supplied repo from the list of assignments
function forgetRepo(repoName) {
    const finishedJson = JSON.parse(readFileSync('finished-assignments.json'))
    // end early if assignment not tracked
    if (!finishedJson.assignments.includes(repoName)) return console.log(error(`assignment`), info(repoName), error('not currently tracked'))
    // remove all references to the unwanted assignment
    finishedJson.assignments = finishedJson.assignments.filter(assignment => assignment !== repoName)
    finishedJson.students = finishedJson.students.map(student => {
        return {
            ...student,
            completed: student.completed.filter(assignment => assignment !== repoName)
        }
    })
    // write the json and remove the directory
    writeFileSync('./finished-assignments.json', JSON.stringify(finishedJson))
    spawn(`rm -rf ${repoName}`, { shell: true })
    console.log(success('removed assignment:'), info(repoName), success('from being tracked'))
}

// --list: print out all tracked assignments
function listAssignments() {
    const finishedJson = JSON.parse(readFileSync('finished-assignments.json'))
    console.log(info('currently tracking:'))
    finishedJson.assignments.forEach(assignment => console.log(assignment))
}

// --sync: looks at the config.json and adds any new students to the finished assignments json
function syncStudents() {
    const finishedJson = JSON.parse(readFileSync('finished-assignments.json'))
    // find all the new students added to the config
    const newStudents = students.filter(student => {
        let isNew = true
        finishedJson.students.forEach(finStudent => {
            if (finStudent.name === student.name) isNew = false
        })
        return isNew
    })

    newStudents.forEach(newStudent => {
        finishedJson.students.push({ ...newStudent, completed: [] })
        console.log(info(`added:`), newStudent.name)
    })

    // find all the students who have been taken out of the config and remove them
    const dropStudents = finishedJson.students.filter(student => {
        let isDrop = true
        students.forEach(confStudent => {
            if (confStudent.name === student.name) isDrop = false
        })
        return isDrop
    })
    // remove any students that may have dropped
    dropStudents.forEach(dropStudent => {
        finishedJson.students = finishedJson.students.filter(currentStudent => {
            if (dropStudent.name != currentStudent.name) {
                return true
            } else {
                console.log(error('removing'), currentStudent.name)
                return false
            }
        })
    })
    // find folks with new usernames
    students.forEach(student => {
        // find student in finshed json
        for (let i = 0; i < finishedJson.students.length; i++) {
            if (finishedJson.students[i].name === student.name) {
                // check if there is a username change
                if (finishedJson.students[i].username !== student.username) {
                    console.log(info(`updating ${student.name}'s username to be ${student.username} in the finished-assignments.json`))
                    // update the finished assignments json based on what was found in config.json
                    finishedJson.students[i].username = student.username
                }
                break
            }
        }
    })
    writeFileSync('./finished-assignments.json', JSON.stringify(finishedJson))
}

// --updateAll: loops over the array of finished assigments and reclones them all
async function updateAll() {
    console.log(info('Updating all repos found in the ./finished-assignments.json'))
    if (!existsSync('./finished-assignments.json')) {
        console.log(warn('./finished-assignments.json not found. Make sure to clone a homework first.'))
    }
    const { assignments } = JSON.parse(readFileSync('finished-assignments.json'))
    // remove overwrite flag to avoid infinite loop
    const filteredFlags = flags.filter(flag => flag === '--overWrite')
    // build command from flags and execute it
    const updateCommands = assignments.map((assignment) => {
        let command = `node cloneHw.js ${assignment}`
        filteredFlags.forEach(flag => command += ` ${flag}`)
        return command
    })

    let i = 0
    while (i < updateCommands.length) {
        console.log(info(`${i} of ${assignments.length} repos updated: ${Math.round((i / assignments.length) * 100)}% complete.`))
        console.log(info(`Updating ${assignments[i]}.`))
        try {
            await spawnAsync(updateCommands[i])
        } catch (err) {
            console.log(err)
        }
        i++
    }
}

// --complete: adds assignment to student as completed
function completed(repoName, studentName) {
    const finishedJson = JSON.parse(readFileSync('finished-assignments.json'))

    // make sure it is a valid student name, and find their index in the array
    let studentIndex = -1
    for (let i = 0; i < finishedJson.students.length; i++) {
        if (finishedJson.students[i].name === studentName) {
            studentIndex = i
            break
        }
    }

    // quit if the student was not found
    if (studentIndex === -1) {
        console.log(error(`no student found with name '${studentName}'`))
        console.log(warn(`example usage: node cloneHw.js < repo name > < student name > --completed\n(Make sure to include the dash in the student's name. eg: First-Last)`))
        console.log(info('exiting...'))
    }

    // add assignment as tracked if it is not already
    if (!finishedJson.assignments.includes(repoName)) {
        console.log(info(`Tracking submissions for ${repoName}!`))
        finishedJson.assignments.push(repoName)
    }

    // check if the student has turned in the assingment, if not, add it
    if (finishedJson.students[studentIndex].completed.includes(repoName)) {
        console.log(info(`${repoName} is already marked completed for ${finishedJson.students[studentIndex].name}`))
    } else {
        console.log(info(`adding ${repoName} as completed for ${finishedJson.students[studentIndex].name}`))
        finishedJson.students[studentIndex].completed.push(repoName)
    }

    writeFileSync('./finished-assignments.json', JSON.stringify(finishedJson))
}

// --allCompleted: adds assignment to all students as completed
function allCompleted(repoName) {
    const finishedJson = JSON.parse(readFileSync('finished-assignments.json'))

    // check if assignment is tracked, if not, add it
    if (!finishedJson.assignments.includes(repoName)) {
        console.log(info(`Tracking submissions for ${repoName}!`))
        finishedJson.assignments.push(repoName)
    }

    // add assignment to each student
    finishedJson.students.forEach(student => {
        if (!student.completed.includes(repoName)) {
            console.log(info(`adding ${repoName} as completed for ${student.name}`))
            student.completed.push(repoName)
        }
    })

    writeFileSync('./finished-assignments.json', JSON.stringify(finishedJson))
}

main()