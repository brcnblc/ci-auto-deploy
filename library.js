const run = require('child_process').spawnSync; //Syncronous execution

class Print {
  constructor(silent){
    this.silent = silent;
  }

  print(txt){
    if (!this.silent){
      console.log(txt);
    }
  }

}

// Syncronous git function
function git(args, kwargs={}, status, override_simulate ){

  const { raise_on_error, print_stdout, print_command, simulate, silent } = kwargs;
  const processOptions = {encoding: 'ascii', shell:true}
  let result = {};

  const command = args.split(' ')[0]
  const command_has_dryrun = ['add', 'commit', 'push'].includes(command)
  if (command_has_dryrun && simulate){
    args += (' --dry-run')
  }

  if (print_command){
    console.log(`Command : git ${args}\n`)
  }


  try{
    if (!simulate || override_simulate || command_has_dryrun){
      result = run(`git ${args}`, processOptions)
    } else {
      console.log (`Simulate call : git ${args}\n`)
    }

    if (result['stderr'] && result['status'] != 0){throw result}
    if (print_stdout &! silent){
      console.log(`Result : ${result['stdout']}`)
      console.log(result['stderr'])
      status.push({command: `git ${args}`, result: result['stdout'], error: result['stderr']})
    }

    return result['stdout']
  }
  catch (error) {
    status.push({command: `git ${args}`, error: error['stderr']})
    console.log(error['stderr'])
    if(raise_on_error){
      throw {error}
    }
  }
}

function escapeRegExp(str) {
  //try{
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); // $& means the whole matched string
  //} catch (err) {
  //  let a=1
  //}
  
}

function replaceAll(source, srch, repl){
  return source.split(srch).join(repl)
}

function nested(obj, callBack = () => {}, internals = {parentList : [], levelEvents : {}}) {
  if (!obj) return null;
  Object.keys(obj).forEach((item, index, array) => {
    
    
    const value = obj[item]
    const type = Array.isArray(obj[item]) ? 'array' : typeof obj[item]
    const parentType = Array.isArray(obj) ? 'array' : typeof obj
    const isValue = type != 'object' && type != 'array'
    const parentItem = internals.parentList[internals.parentList.length-1]
    const levelEvents = Object.assign({}, internals.levelEvents)
    const parentList = internals.parentList.slice(0)
    let parentPath = parentList.join('.')
    if (parentPath[0] == '.'){parentPath = parentPath.substr(1)}
    const currentPath = (parentPath ? parentPath + "." : "") + item;
    const pathList = parentList.slice(0);pathList.push(item)
    const level = parentList.length
    

    // Invoke callback function
    callBack({item, value, parentPath, currentPath, type, parentType, 
        isValue, parentItem, level, levelEvents, pathList, parentList});

    internals.levelEvents = {}

    if (typeof obj[item] === "object") {
      internals.parentList.push(item);
      internals.levelEvents = {changed: true, onEnter: true}
      
      // Recursive call
      nested(obj[item], callBack, internals);
      
      internals.levelEvents = {changed: true, onExit: true}
      internals.parentList.pop();
    }

  });
}

function isDict(v) {
  return !!v && typeof v==='object' && v!==null && !(v instanceof Array) && !(v instanceof Date) 
}

function dictMerge(source, merge){
  for (let k in merge){
        if ((k in source) && isDict(source[k])){
            dictMerge(source[k],merge[k])
        }
        else{
          source[k] = merge[k]
        }
  }
}

module.exports = { git, run, Print, escapeRegExp, nested, isDict, dictMerge, replaceAll }