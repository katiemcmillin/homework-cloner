# HwCloner

Script to automate pull request cloning and track submitted assignments.

hwCloner.js scrapes pull requests from a supplied repo name, and if the pull requests were made by students that are found in the `config.json`, they are pulled down and tracked in the `finished-assignments.json`.

# Getting Started

### config.json:

* `touch config.json` to create the .gitignored config file. 

The `config.json` contains the access tokens, api configuration, and an array of students to scrape from the github api

`config.json` example:

```json
{ 
  "hostname": "api.github.com",
  "userName": "your-gh-username",
  "githubToken": "your_gh_token",
  "orgs": ["WDI-SEA"],
  "students": [
    { "name": "student-name", "username": "github-username" },
    { "name": "student-name", "username": "github-username" }
  ]
}
```

Use hostname `"hostname": "api.github.com"` for www.github.com and `"hostname": "git.generalassemb.ly"` for github enterprise.

The github token must be generated on your account by going to `settings > developer settings > personal access tokens`. Generate a new token with all scopes. [This link](https://github.com/settings/tokens/new) is where you can generate a token for open source github and [this link](https://git.generalassemb.ly/settings/tokens) to generate a token for enterprise github.

The orgs can be an array of orgs to check for example a class org and the upstream main campus org. 

## Example Usage:

To clone your student's pull requests from github.com/WDI-SEA/css-positioning:

`node cloneHw.js css-positioning`

Command Line Output: 

![cli](https://i.imgur.com/iWJS5RI.png)

`node cloneHw.js <repo name>`

> clones down all pull requests and tracks the assignment, does not overwrite repos if they are found locally

`node cloneHw.js <repo name> --overWrite`

> clones down all pull requests and tracks the assignment, overwrites repos if they are found locally

`node cloneHw.js <repo name> --noTrack <--overWrite>`

> clones down all pull requests and does not track the assignment, `--overWrite` can optionally be used.

`node cloneHw.js <repo name> --forget`

> removes the repo from being tracked and deletes the folder locally

`node cloneHw.js --check` 

> checks all tracked assignments and the percentage turned in for each student and displays them in the terminal

`node cloneHw.js --check --noGreen` 

> checks all tracked assignments and the percentage turned in for each student, only displays yellow and red students in the terminal

`node cloneHw.js --list`

> lists the assignments currently tracked in the terminal

`node cloneHw.js --sync`

> checks for differences between the students in `config.json` and the students that are tracked and synchronizes  them. If a student adds or drops the class, the `config.json` can be modified to update the hw cloner

`node cloneHw.js --updateAll <--overWrite>`

> checks in the `finished-assignments.json` for all tracked assignments and clones them all down. Works with all flags that modify cloning behavior such as `--overWrite`. 

`node cloneHw.js < repoName > --allCompleted`

> marks `< repoName >` as completed for all students

### Dependencies:

Node

### Bugs squashed:

1. Fix crash when user's repo name is different from upstream repo name
2. Fix crash on invalid args
3. Fix script ending early on re-clone 
4. Fix multiple folders being made for names w/ spaces

### Feature Additions:

1. Tool now can pull from multiple Github organizations simultaneously
2. Tool can now use either gh or gh enterprise
3. Tool now tracks submitted assignments

### Know bugs

* repos cannot have more that 100 prs
* `--sync` will not update changed usernames
