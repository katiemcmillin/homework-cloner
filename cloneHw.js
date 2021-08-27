const https = require("https") 
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

// functions for console colors
const {
  error,
  warn,
  info,
  success
} = require('./colors.js')

// the repo name should be the first arg to the script
const repoName = process.argv[2] 

// match command flags that start with --
const flags = process.argv.filter(argv => argv.match(/(?<!\w)--\w+/)) 

// If no repo specified in cli args, end program
if (!repoName) {
  console.log(`${error('No arguments to evaluate!')}\nExiting...`) 
  process.exit() 
}

function main() {
  // check if the missign-assingments.json exists, if not, create it
  if(!existsSync('./finished-assingments.json')) {
    console.log(warn('./finished-assignments.json not found, creating it now...'))
    createFinishedJson()
  }

  // forego cloning if one of the following flags is found
  if(flags.includes('--check')) return checkSubmissions()
  if(flags.includes('--forget')) return forgetRepo()
  if(flags.includes('--list')) return listAssignments()
  if(flags.includes('--sync')) return syncStudents()
  if(flags.includes('--updateAll')) return updateAllRepos()

  return cloneHw()
}

async function cloneHw() {
  let pullRequests = await Promise.all(orgs.map(org => xhr(org)))
  pullRequests = [].concat.apply([], pullRequests)  // Flatten array of arrays
  pullRequests = pullRequests.filter(pr => pr.message != 'Not Found') // Strip empty PR, in the case of no PR from 2nd org

  let studentSubmissions = [] 
  studentSubmissions = getStudentsPullRequests(pullRequests) 
  await cloneRepositories(studentSubmissions)
  logMissingSubmissions(studentSubmissions) 
  addNewAssigment()
  updateFinishedAssignments(studentSubmissions)
}

// make xhr request
async function xhr(org) {
  // the enterprise api url is different grrr....
  const apiUrl = hostname === "git.generalassemb.ly" ? "/api/v3/repos" : "/repos"
  const options = {
    hostname, // "git.generalassemb.ly" || "api.github.com"
    path: `${apiUrl}/${org}/${repoName}/pulls`,
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
      res.on("end", () => {
        body = JSON.parse(body) 
        if (body.message) {
          console.error(error(`Warning: No repository found for: ${org}/${repoName}`))
          console.log(info('exiting...'))
          process.exit()
        }
        resolve(body) 
      }) 
      res.on("error", err => {
        reject(new Error(error('Failed XHR, status code: '), res.statusCode))
      }) 
    }) 
  })
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
async function cloneRepositories(submissions) {
  // BASH scripting magic: If folder not present - mkdir and clone, else echo message
  // $1: studentName, $2: repoPath, $3: orgName
  // OG bash function that doesn't reclone when a folder is found
  let msg = warn('directory already on drive')
  let bashFunction = 
  `hw() { 
    if [ ! -d "$1" ] ;  then
      mkdir "$1" 
      echo "Cloning into '${repoName}/$1' from $3"
      git clone -q git@github.com:$2.git $1 
    else
      echo "$1: ${msg}"
    fi
  }`

  // deleted found repos if the --overWrite flag is used
  if(flags.includes('--overWrite')) {
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
      git clone -q git@github.com:$2.git $1 
    }`
  }
  
  // mkdir if doesn't exist and cd
  var cliCommand = `${bashFunction} && mkdir -p ${repoName} && cd ${repoName}`  
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
    console.error(data.toString().trim()) 
  }) 
  const exitCode = await new Promise((resolve, reject) => {
    childProcess.on('close', resolve) 
  }) 
}

// print out which students didn't submit pull request submission
function logMissingSubmissions(submissions) {
  if (submissions.length !== students.length) {
    //array of github usernames that made submission
    let githubUsernames = submissions.map(submission => submission.user.login) 
    //array of students that didnt make submission
    let difference = students.filter(student => !githubUsernames.includes(student.username))  
    
    let names = "" 
    difference.forEach(student => (names += `${student.name} `)) 
    console.log(error(`Missing submissions from: ${names}`)) 
  }
}

// adds new assignment to the finished assignments json (does not add if it is not new)
function addNewAssigment() {
  const finishedJson = JSON.parse(readFileSync('finished-assingments.json'))
  if(!finishedJson.assignments.includes(repoName)) {
    finishedJson.assignments.push(repoName)
    writeFileSync('./finished-assingments.json', JSON.stringify(finishedJson))
  }
}

// adds assignment and student submissions to json
function updateFinishedAssignments(submissions) {
  //array of github usernames that made submission
  const githubUsernames = submissions.map(submission => submission.user.login) 
  const finishedJson = JSON.parse(readFileSync('finished-assingments.json'))
  finishedJson.students.forEach(student => {
    // only add if a submission is found
    if(githubUsernames.includes(student.username)){
      // do not add duplicates
      if(!student.completed.includes(repoName)) student.completed.push(repoName)
    } 
  })
  writeFileSync('./finished-assingments.json', JSON.stringify(finishedJson))
}

// creates the json that tracks turned in deliverbles
function createFinishedJson() {
  const finishedObj = {
    assignments: [],
    students: students.map(student => {
      return { ...student, completed: [] }
    })
  }
  writeFileSync('./finished-assingments.json', JSON.stringify(finishedObj))
}

/**
 * Flag Functions: 
 * these are invoked instead of cloneHw if the corresponding flag in present 
 * in the cli args
 */

// --check: checks submissions in finished-assignments.json
function checkSubmissions() { 
  const finishedJson = JSON.parse(readFileSync('finished-assingments.json'))
  // greater than or equal to this will appear yellow 
  const yellowPercent = 85
  // less than this will appear red
  const redPercent = 80
  // loop over each student and compare their completed with the assignments to calculate missing
  finishedJson.students.forEach(student => {
    const missing = []
    let missingString = ''
    finishedJson.assignments.forEach(assignment => {
      if(!student.completed.includes(assignment)) {
        missing.push(assignment)
        missingString += `${assignment} `
      }
    })
    // calculate missing percentage
    const percent = (finishedJson.assignments.length - missing.length) * 100 / finishedJson.assignments.length
    // print student name and missing assigments
    const color = percent < redPercent ? error : 
    percent <= yellowPercent ? warn :
    success 
    const msg = `${student.name}\n${missing.length} missed assignments:\n${missingString}\ncompletion rate: ${percent}%`
    if(flags.includes('--noGreen')) {
      if(percent < redPercent) {
        console.log('-----\n')
        console.log(color(msg))
        console.log('\n-----')
      }
    } else {
      console.log('-----\n')
      console.log(color(msg))
      console.log('\n-----')
    }
  })
}

// --forget: removes the supplied repo from the list of assignments
function forgetRepo() { 
  const finishedJson = JSON.parse(readFileSync('finished-assingments.json'))
  // remove all references to the unwanted assignment
  finishedJson.assignments = finishedJson.assignments.filter(assignment => assignment !== repoName)
  finishedJson.students.map(student => {
    console.log(student)
    return {
      ...student,
      completed: student.completed.filter(assignment => assignment !== repoName)
    }
  })
  // write the json and remove the directory
  writeFileSync('./finished-assingments.json', JSON.stringify(finishedJson))
  spawn(`rm -rf ${repoName}`, { shell: true }) 
  console.log(success('removed repo:'), info(repoName), success('from bering tracked'))
}

// --list: print out all tracked assignments
function listAssignments() { 
  const finishedJson = JSON.parse(readFileSync('finished-assingments.json'))
  console.log(info('currently tracking:'))
  finishedJson.assignments.forEach(assignment => console.log(assignment))
}

// --sync: looks at the config.json and adds any new students to the finished assignments json
function syncStudents() {
	const finishedJson = JSON.parse(readFileSync('finished-assingments.json'))
	// find all the new students added to the config
	const newStudents = students.filter(student => {
    let isNew = true
    finishedJson.students.forEach(finStudent => {
      if(finStudent.name === student.name) isNew = false
    })
    return isNew
  })
  newStudents.forEach(newStudent => {
    finishedJson.students.push({...newStudent, completed: []})
    console.log(info(`added:`),newStudent.name)
  })

  // find all the students who have been taken out of the config and remove them
	const dropStudents = finishedJson.students.filter(student => {
    let isDrop = true
    students.forEach(confStudent => {
      if(confStudent.name === student.name) isDrop = false
    })
    return isDrop
  })
  // remove any students that may have dropped
  dropStudents.forEach(dropStudent => {
    finishedJson.students = finishedJson.students.filter(currentStudent =>{
      if(dropStudent.name != currentStudent.name) {
        return true
      } else {
        console.log(error('removing'), currentStudent.name)
        return false
      }
    }) 
  })
	writeFileSync('./finished-assingments.json', JSON.stringify(finishedJson))
}

main()
