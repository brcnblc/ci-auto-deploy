const { spawn, spawnSync } = require("child_process"); // Syncronous execution
const yaml = require('js-yaml');
const { escapeRegExp, dictMerge, nested } = require('./library');
const prompts = require ('prompts');
const md5 = require('blueimp-md5');
const _ = require('lodash');
const fs = require("fs");

// Copies source file on to target and replaces the target content.
function copyFile(source, target) {
  const processOptions = {encoding: 'ascii', shell: true};

  try {
    let result;
    result = spawnSync (`cp -f ${source} ${target}`, processOptions);
    if ( result.status != 0) throw result.stderr;
    console.log(`\n${source} file coppied onto ${target} file.`);
  }
  catch (err) {
    throw err;
  }
}

// Disables the line by commenting
function disableLine (searchString, file, commentCharacter) {
  try {
    let fileContent = fs.readFileSync(file, 'utf8');
    const findKeys = fileContent.search(new RegExp(`^${escapeRegExp(searchString)}`,'m'), fileContent);
    if (findKeys > -1) {
      fileContent = fileContent.substr(0, findKeys) + commentCharacter + fileContent.substring(findKeys);
      fs.writeFileSync(file, fileContent);
    }
    console.log(`\n${searchString} has been commented in ${file} file.`);
  }
  catch (err) {
    throw err;
  }
}

function listFiles(folder, extension) {
  const ls = fs.readdirSync(folder, {encoding: 'ascii'});
  const lsFiles = ls.filter(v=>!fs.statSync(folder + '/' + v).isDirectory());
  const lsFiltered = lsFiles.filter(v=>v.substr(-5, 5) == extension)
  return lsFiltered
}

function parseJsonFile(file){
  try {
    let strFileContents = fs.readFileSync(file, 'utf8')
    return JSON.parse(strFileContents)

  } catch (err){
    if (err.errno != -2){
      console.error(err);
      throw (err)
    }
  }
}

function parseYmlFile(file, raiseOnError ){
  try {
    let strFileContents = fs.readFileSync(file, 'utf8')
    return yaml.load(strFileContents)

  } catch (err){
    if (err.errno != -2 || raiseOnError){
      //console.error(err);
      throw (err)
    } else {
      return err
    }
  }
}

function dumpYmlFile(file, value){
  try {
    fs.writeFileSync(file, yaml.dump(value))

  } catch (err){
    if (err.errno != -2){
      console.error(err);
      throw (err)
    }
  }
}

function sleep(ms){
  return new Promise(resolve=>{
      setTimeout(resolve,ms)
  })
}

// Starting Prompt
async function startingPrompt (mustInput= 'y', maxTry = 3) {
  let response, cnt = 0;
  while (cnt < maxTry) {
    cnt++;
    response = await prompts({
      type: 'text',
      name: 'continue',
      message: 'Please enter (y) to continue (q) to quit :'
    })
    if (response.continue == 'q'){break}
    if (response.continue == mustInput){
      return true 
    } else {
      console.error(`Wrong Entry. Please Try again.`)
    }
  }
  
  return false
} 

// Password Prompt
async function passwordPrompt (environment, secret, maxTry = 3) {
  let response, cnt = 0;
  while (cnt < maxTry) {
    cnt++;
    response = await prompts({
      type: 'text',
      name: 'password',
      message: `Please enter password for '${environment}' environment : (q) to quit`
    })
    if (response.password == 'q'){throw ('Process aborted on user input.')}
    if (md5(response.password) == secret){
      break 
    } else {
      console.error(`Wrong Password. ${maxTry - cnt} Trials Left. (q to quit)`)
    }
  }
  if (md5(response.password) != secret){throw ('Authorization Error')}
  return true
} 

// Capitalize first Letter
const capitalize = s => s.charAt(0).toUpperCase() + s.slice(1)

// Camelcase of string v seperated with s such as ('hello_world' , '_') => helloWorld
const camelCase = (v,s) => v.split(s).slice(1).reduce((p,c) => p + capitalize(c), v.split(s)[0])

// Pass Content after parsing yaml file with parseYmlFile('fileName.yaml') function
function evaluateYaml(content, variables) { 
  let context = {};
  
  //dictMerge(context, kwArgs)
  _.merge(context, variables)
  _.merge(context, content)
  let conf={};

  // Main Nest Function
  const nestFunction = (source, target) => nested(source, returnArgs => {

  const {item, value, parentPath, currentPath, type, parentType, isValue, parentItem, 
    level, levelEvents, pathList, parentList} = returnArgs;

  const clearSlash = (path) => path.map(path => path.substr(-1) == '/' ? path.substr(0,path.length - 1) : path)

  const nestedSetPathList = (obj, pathList, value) => {
    _.set(obj, clearSlash(pathList), value)
  }

  const nestedGetPathList = (obj, pathList) => {
    return _.get(obj, clearSlash(pathList))
  }

  // current.variable assignments ending with /
  if (parentItem && parentItem.substr(-1) == '/'){
    nestedSetPathList(target, pathList, {})
    const ref = nestedGetPathList(target, pathList)
    nestedSetPathList(context, ['current', parentItem.slice(0,parentItem.length-1)], ref)
    nestedSetPathList(context, ['current', parentItem.slice(0,parentItem.length-1), 'name'], item)
  }

  if (isValue){
    const pattern = new RegExp(/\$\{([^\{\}]+)\}/g); // match ${variableName}
    let match = pattern.exec(value), modifiedValue = value
    if (match){
      const matchedVariableArray = []
      while (match != null){
        
        const replaceValue = match[0] 
        const matchedVariable = match[1] 
        matchedVariableArray.push(matchedVariable)
        
        let evalValue;

        let matchedVarPath = matchedVariable.split('.');
        
        // Search current.* item in context
        evalValue = nestedGetPathList(context, matchedVarPath)
        
        // Search in current node
        if (!evalValue){
          matchedVarPath = clearSlash(parentList.slice(0))
          matchedVarPath.push(match[1] )
          evalValue = nestedGetPathList(target, matchedVarPath)
        }
       
        // If not found
        if (!evalValue){
          if (item == 'inherit|'){
            throw(`Configuration Parse Error: Could not resolve ${value}\n in ${currentPath}`)}
          else {
            match = pattern.exec(value)
            continue; // pass to next variable in string
          }
        }
        if (item=='configFile$'){
          let a=1
        }
        // Found and it is an object
        if (typeof evalValue == 'object'){
          
          if (replaceValue != value){
            throw (`Parsing Error : \n${value}\n at line ${currentPath}`)}
          
          if (matchedVariable.includes('current')){
            modifiedValue = nestedGetPathList(context, matchedVarPath)
            
          } else {
            modifiedValue = nestedGetPathList(target, matchedVarPath)
          } 

          const remodifiedValue = {}
          nestFunction(modifiedValue, remodifiedValue)
          modifiedValue = remodifiedValue

        } 
        // Found and it is part of a string
        else {
          modifiedValue = modifiedValue.split(replaceValue).join(evalValue) // replaceAll
        }

        // Look for next match
        match = pattern.exec(value)

      } // end of while


      if (item == 'inherit|'){
        // inherit an object
        nestedSetPathList(target, parentList, modifiedValue)
        
      }
      else if (item == 'onOut|'){
        let a=1
      }
      else if (item == 'readYaml|'){
        let file, key, subContext_;
        if (Array.isArray(modifiedValue)){
          [file, key, subContext_] = modifiedValue
        } else {
          [file, key, subContext_] = modifiedValue.split(',')
        }
        
        let subContext;
        if (subContext_){
          subContext = yaml.load(subContext_.replace(':\\',':'))
        }
        let yamlFileContent = parseYmlFile(file)
        if (yamlFileContent && yamlFileContent.errno == -2){
          throw(`Yaml Error at ${currentPath} \n ${yamlFileContent.message}`)
        }
        let dict = evaluateYaml(yamlFileContent, {...context, ...subContext});
        let dictValue = dict[key];
        let currentValue = nestedGetPathList(target, parentList)
        matchedVariableArray.forEach(v=>{
          if (v.substr(-1)=='$'){
            delete(currentValue[v])
          }
          
        })
        _.merge(currentValue,dictValue)

      }
      else {
        // assign to an variable
        nestedSetPathList(target, pathList, modifiedValue)
      }
    } else {
      // assign to literal
      nestedSetPathList(target, pathList, value)
      
    }
  } 
  // End of is (isValue)
  })

  // Call Nest Function
  nestFunction(content, conf)

  return conf
}

function dateSuffix(sep = '_'){
  const date = new Date();
  const yy = date.getFullYear().toString().substr(2)
  const frmt = (s) => {return (s.length == 1) ? '0' + s : s.toString()}
  const mm = frmt(date.getMonth().toString())
  const dd = frmt(date.getDate())
  const hh = frmt(date.getHours())
  const MM = frmt(date.getMinutes())
  const ss = frmt(date.getSeconds())
 
  const datex = yy + mm + dd + sep + hh + MM + ss
 
  return datex
 
 }

module.exports = {copyFile, disableLine, listFiles, parseJsonFile, parseYmlFile, startingPrompt,
  sleep, passwordPrompt, capitalize, camelCase, evaluateYaml, dumpYmlFile, dateSuffix}