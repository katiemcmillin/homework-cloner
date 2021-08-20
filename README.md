# HwCloner

## Script to automate pull request cloning

### Example Usage:

To clone your student's pull requests from github.com/WDI-SEA/css-positioning:

`node cloneHw.js css-positioning`

### Command Line Output: 

![cli](https://i.imgur.com/iWJS5RI.png)

### config.json:

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

The github token must be generated on your account by going to `settings > developer settings > personal access tokens`. Generate a new token with all scopes. 

The orgs can be an array of orgs to check for example a class org and the upstream main campus org. 

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
