# HwCloner
## Script to automate pull request cloning

### Example Usage:
To clone your student's pull requests from github.com/WDI-SEA/css-positioning:

`node cloneHw.js css-positioning`

### Command Line Output: 
![cli](https://i.imgur.com/xO6kaDr.png)

### students.json:
`students.json` example:
```
{ "students": [
    { "name": "student-name", "username": "github-username" },
]}
```
### Dependencies:
Node

### ToDo: 
1. implement cloning to a destination path

### Bugs squashed:
1. Fix crash when user's repo name is different from upstream repo name
2. Fix crash on invalid args