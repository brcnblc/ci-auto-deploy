const fs = require("fs");
const yaml = require("js-yaml");
const _ = require("lodash");
const { nested } = require('./library');
const dotenv = require("dotenv");

// Parse Yaml File
function parseYmlFile(file, options ){
  let strFileContent;
  try {
    strFileContent = fs.readFileSync(file, 'utf8')
  } catch (err){
    handleError (err, options)
  }

  return parseYaml(strFileContent, {yamlFileName: file})
}

function parseYaml(strContent, options={}){
  try {
    return yaml.load(strContent)
  } catch (err) {
    if (err.mark.line !== 0){
      const lineContent = getLineFromLineNumber(strContent, err.mark.line + 1)

      if (lineContent){
        options.lineNumber = err.mark.line - (options.includedFileTotalLines ? options.includedFileTotalLines : 0);
        options.strContent = strContent
        
      } else {
        options.lineContent = strContent
      }
    }
    handleError(err, options)
  }
}


// Common Error Handler
function handleError(err, options){
  const raiseOnError = 'raiseOnError' in options ? options.raiseOnError : true
  const debug = options.debug

  if (raiseOnError){
    if (options.yamlFileName){
      console.error(`Error in Yaml File : "${options.yamlFileName}" line ${options.lineNumber}, ${err.mark ? 'Column : ' + (err.mark.column + 1) : ''}`);//${options.lineContent}`);//if (err.mark){console.error (' '.repeat(err.mark.column - 1), '^')}
    }
    if (!err.reason){ //errors other than yaml errors
      if (debug){
        console.error(err.stack)
      } else {
        console.error(err.message)
      }
      
    
    } else {
      const line2 = getLineFromLineNumber(err.message, 2)
      const line3 = getLineFromLineNumber(err.message, 3)
      const testLine2 = line2 && line2.trim() 
      if (testLine2 == ""){
        console.error(options.lineContent + '\n\n'  + err.reason )
      } else {
        console.error(line2 + '\n' + line3 + '\n' + err.reason )
      }
      
        
    }
    throw (-1)
  } else {
    return err
  }
}

// Read text file specified by path argument and return contents as string.
function readFile(path, options = {} ){
  try {
    return fs.readFileSync(path, {encoding:'utf8'})
  } catch (err) {
    return handleError(err, options)
  }
}

// Finds line by counting number of \n in string upto index.
function findLineFromIndex(strContent, index){
  if (!index){
    index = strContent.length;
  }
  const subContent = strContent.substr(0, index);
  const match = subContent.match(/$/gm)
  return match == null ? 0 : match.length;
}

// Gets line content of a multiline string at specified line
function getLineFromLineNumber(strContent, lineNumber){
  const match = strContent.match(/(^.*)/gm)
  return match && match.length > 0 ? match[lineNumber - 1] : ''
}

// Evaluate include statements in Yaml file
function evaluateIncludes(yamlFileName, context, options={}){
    const stringContent = readFile(yamlFileName, options)
    options.yamlFileName = yamlFileName
    let replacedContent = stringContent;
    const pattern = new RegExp('(include\\|: (.+$))', 'gm');
    let yamlContent, lineNumber, lineContent, includedFileTotalLines = 0;

    // Loop while there is a match
    while (match = pattern.exec(replacedContent)){
      index = match.index;
      lineNumber = findLineFromIndex(replacedContent, match.index);
      lineContent = getLineFromLineNumber(stringContent, lineNumber);
      const replaceLine = match[1];
      const includeFileName = match[2];
      const evaluatedYamlObject = evaluateYaml(null, context, replaceLine, {yamlFileName, lineNumber, lineContent})
      const evaluatedFileName = evaluatedYamlObject['include|']
      
      // tryParse but do not use
      parseYmlFile(evaluatedFileName, {yamlFileName, lineNumber, lineContent})

      //Find number of spaces at the end
      const searchStr = replacedContent.substr(0,index)
      let lastChar = searchStr[searchStr.length - 1]
      let tabCnt = 0
      while (lastChar == " "){
        tabCnt++;
        lastChar = searchStr[searchStr.length - 1 - tabCnt]
      }
    

      const includeFileContent = readFile(evaluatedFileName, {yamlFileName, lineNumber, lineContent})
      const headersRemovedIncludeContent = includeFileContent.replace(/^---/gm, `# ---`)
      const tabbedContent = headersRemovedIncludeContent.replace(/^/gm,' '.repeat(tabCnt));
      const descrAddedContent = `# Included from ${evaluatedFileName}\n${tabbedContent}`
      
      replacedContent = replacedContent.replace(replaceLine, descrAddedContent);
      includedFileTotalLines += findLineFromIndex(includeFileContent)
      options.includedFileTotalLines = options.includedFileTotalLines ? options.includedFileTotalLines + 
        includedFileTotalLines - 1: includedFileTotalLines - 1;
    } 
      yamlContent = parseYaml(replacedContent, options)
    
     
    return {stringContent, yamlContent};
  
 
}

// Evaluate yamlFile or content
function evaluateYaml(yamlFileName, variables, strContent, options ) { 
  
  let context = {},content={}, stringContent;
  _.merge(context, variables)
  // Evaluate includes
  if (strContent){
    stringContent = strContent;
    content = parseYaml(stringContent, options)
  } else {
    const includes = evaluateIncludes(yamlFileName, context, options)
    stringContent = includes.stringContent;
    content = includes.yamlContent;
  }
  let replacedContent = stringContent;

  _.merge(context, content)

  const contextObjects = ['current', 'args']
  const commands = ['forEach', 'if']
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
  let lineNumber, lineContent;
  if (isValue){
    const pattern = new RegExp(/\$\{([^\{\}]+)\}/g); // match ${variableName}
    let match = pattern.exec(value), modifiedValue = value
    if (match){
      
      const matchedVariableArray = []
      while (match != null){
        
        const replaceValue = match[0] 
        const matchedVariable = match[1] 
        matchedVariableArray.push(matchedVariable)
        
        const index = replacedContent.indexOf(replaceValue)
        lineNumber = findLineFromIndex(replacedContent, index)
        lineContent = getLineFromLineNumber(replacedContent, lineNumber)

        let evalValue;
       
        let matchedVarPath = matchedVariable.split('.');
        const isContextObject = contextObjects.includes(matchedVarPath[0])
        
        // First Search full path in context
        evalValue = nestedGetPathList(context, matchedVarPath)
        
        // Then Search nodes back to root
        if (!evalValue  &! isContextObject){

          matchedVarPath = clearSlash(parentList.slice(0))
          const matchValuePath = match[1].split('.') 
          matchedVarPath.push(...matchValuePath)
          if (matchValuePath == 'appName$'){
            let a
          }
          const length = matchedVarPath.length;
          for (let i=0; i < length; i++){
            evalValue = nestedGetPathList(target, matchedVarPath)
            if (evalValue){
              break;
            } else {
              for (let k=0; k < matchValuePath.length; k++){
                matchedVarPath.pop()
              }
              matchedVarPath.pop()
              matchedVarPath.push(...matchValuePath)
            }
          }  
        }
        
        
        // If not found -----------
        if (!evalValue){
          if (item == 'inherit|'){
            throw(`Configuration Parse Error in ${yamlFileName} line ${lineNumber} :\n ${lineContent}\nCould not resolve ${value}`)}
          else {
            match = pattern.exec(value)
            continue; // pass to next variable in string
          }
        }
        
        // Found and it is an object
        if (typeof evalValue == 'object'){
          
          // if (replaceValue != value){
          //   throw (`Parsing Error in ${yamlFileName}: \n${value}\n at line ${currentPath}`)}
          
          if (matchedVariable.includes('current')){
            modifiedValue = nestedGetPathList(context, matchedVarPath)
            
          } else {
            modifiedValue = nestedGetPathList(target, matchedVarPath)
            if (!modifiedValue){
              modifiedValue = evalValue
            }
          } 

          const remodifiedValue = {}
          nestFunction(modifiedValue, remodifiedValue)
          modifiedValue = remodifiedValue
          // 
          replacedContent = replacedContent.replace(replaceValue, 'Object-' + matchedVariable.toUpperCase())

        } 
        // Found and it is part of a string
        else {
          modifiedValue = modifiedValue.split(replaceValue).join(evalValue) // replaceAll
          // const index = replacedContent.indexOf(replaceValue)
          // lineNumber = findLineFromIndex(replacedContent, index)
          // lineContent = getLineFromLineNumber(replacedContent, lineNumber)
          replacedContent = replacedContent.replace(replaceValue, evalValue)
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
        let file, key, subContext_, paramArray;
        if (Array.isArray(modifiedValue)){
          [file, key, subContext_] = modifiedValue
        } else {
          paramArray = modifiedValue.replace(/\s&^[: ]/gm,'').split(',');
          [file, key, subContext_] = paramArray;
        }
        file = file.trim()
        key = key.trim()
        subContext_ = subContext_ && subContext_.trim()

        let subContext;
        if (subContext_){
          if (paramArray && paramArray.length > 3){
            paramArray.slice(3).forEach(value => {
              subContext_ += ',' + value.trim().toString() 
            })
          }
          const replacedSubContext = subContext_.replace(/\:\\/gm,':').replace(/\$\{([^\{\}]+)\}/gm, '\"\$&\"').replace(/""/gm,'"')
          //const replacedSubContext = subContext_.replace(/\:\\/gm,':')
          
          subContext = parseYaml(replacedSubContext,  {yamlFileName: yamlFileName, lineNumber, lineContent})
        }
       
        let dict = evaluateYaml(file, {...context, ...subContext}, null, {yamlFileName: yamlFileName, lineNumber, lineContent});

        const pathList = key.split('.')
        let dictValue = nestedGetPathList(dict, pathList);
        if (!dictValue){
          handleError({message:`Key not found. "${key}" in "${file}"`}, {yamlFileName, lineNumber, lineContent})
        }
        let currentValue = nestedGetPathList(target, parentList)
        if (!currentValue){
          nestedSetPathList(target, parentList, {})
          currentValue = nestedGetPathList(target, parentList)
        }
        matchedVariableArray.forEach(v=>{
          if (v.substr(-1)=='$'){
            delete(currentValue[v])
          }
        })
        _.merge(currentValue,dictValue)

      }
      else if (item == 'readEnv|'){
        const fileContent = readFile(modifiedValue, {yamlFileName, lineNumber, lineContent})
        if (fileContent.errno){
          throw (`Error in ${yamlFileName} \n ${currentPath} ' \n ${fileContent.message}`)
        }
        const envContent = dotenv.parse(fileContent)
        const mergeContent = {}
        nestedSetPathList(mergeContent, parentList, envContent)
        _.merge(target, mergeContent)
        let currentValue = nestedGetPathList(target, parentList)
        matchedVariableArray.forEach(v=>{
          if (v.substr(-1)=='$'){
            delete(currentValue[v])
          }
        })
        //nestedSetPathList(target, parentList, envContent)
        let a
      }
      else if (item == 'writeEnv|'){
        let a=context,b=target;
      }
      else {
        // assign to an variable
        nestedSetPathList(target, pathList, modifiedValue)
      }
    } else {
      // assign to literal
      nestedSetPathList(target, pathList, value)
      
    }
  } else {
    // Scripting command
    let commandArr = item.split('|')
    if (commands.includes(commandArr[0])){
      const lineMatch = new RegExp(`${parentItem}:\\s\+${item}`).exec(replacedContent)
      const lineNumber = lineMatch ? findLineFromIndex(replacedContent, lineMatch.index) + 2 : options.lineNumber
      runScriptCommand(commandArr, value, {context,target}, {...options,yamlFileName, lineNumber, lineContent})
    }
  }
  // End of is (isValue)

  

  })
  
  // Call Nest Function
  nestFunction(content, conf)

  return conf


}

function runScriptCommand (commandArr, commandParams, scope, options){
  let command = commandArr[0]
  switch (command){
    case 'forEach': {
      const subCommand = commandArr[1]
      const inObj = commandParams['in|']
      const loopObj = commandParams['loop|']
      let evalInObj = evaluateYaml(null, {...scope.target}, `inObj: ${inObj}`, options)
      if (!evalInObj || (evalInObj &! evalInObj['inObj'])) {
        evalInObj = evaluateYaml(null, {...scope.context}, `inObj: ${inObj}`, options)
      }
      evalInObj = evalInObj['inObj']
      if (evalInObj === inObj){
        handleError({message:`Unknown variable ${inObj}`}, {...options,lineNumber:options.lineNumber+1})
      }
      let a
    }

  }
}

module.exports = {evaluateYaml, parseYmlFile, readFile};