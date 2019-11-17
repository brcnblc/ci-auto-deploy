const { spawn, spawnSync } = require("child_process"); // Syncronous execution
const yaml = require('js-yaml');
const { escapeRegExp, dictMerge, nested } = require('./library');
const prompts = require ('prompts');
const md5 = require('blueimp-md5');
const _ = require('lodash');
const fs = require("fs");
const argParse = require('./argParse');
const { evaluateYaml } = require('./yaml_script')
const Print = require('./library').Print.prototype;
const print = function (txt){Print.print(txt)};

// Async function to run bash commands
async function runSpawn(command, args, simulate, raiseOnError=true) {
  return new Promise(async function (resolve, reject)  {
    let subProcess, processRunning, exitCode;
    console.log (command, args.join(' '))
    if (!simulate) {
      subProcess = spawn(command, args, {shell:true});
    } else {
      subProcess = spawn('echo', [command, 'simulated'], {shell:true});
    }
    
    subProcess.on('data', data => console.log(`${data.toString()}`));
    
    processRunning = true;
    
    subProcess.stdout.on('data', data => console.log(`${data.toString()}`));
   
    subProcess.stderr.on('data', data => {
      if (raiseOnError){
        reject(data.toString())
      } else {
        console.log(`${data.toString()}`)
      }
    });

    subProcess.on('close', code => {processRunning = false; exitCode = code})
    
    while (processRunning){
      await sleep(1000)
      process.stdout.write('.')
    }

    resolve(exitCode)
  })

}

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

function exit(error){
  let exitCode=1;
  if (error == 0){
    console.log('\nProcess exited succesfully.\n');
    exitCode=0;
  }
  else {
    if (typeof error == 'object' && 'stack' in error){
      console.error(error.stack, '\n');
    } else if (typeof error =='string'){
      console.error(error)
    } else if (typeof error == 'number'){
      exitCode = error
    }
    console.error('\nProcess exited with non zero exit code', '\n');
    
  }
  process.exit(exitCode)
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


function evaluateVariables(args, argDefs){
  
  let kwArgs = {};

  //Parse Defaults with command line arguments
  _.merge(kwArgs, argParse(args, argDefs))

  
  //Merge configuartion file defaults
  
  if (kwArgs.configFile){
    const ci = evaluateYaml(kwArgs.configFile, {args:kwArgs})
    for ([key,value] of Object.entries(ci)){
      _.merge(kwArgs, value)
    }
    _.merge(kwArgs, {input: {globalConfig: ci}})
  }
    
  
  
  //Merge Environment Variables
  {
    const env = process.env[kwArgs.environmentVariable]
    if (env && env != ''){
      _.merge(kwArgs, argParse(env, argDefs, mode = 'argsonly'))
      _.merge(kwArgs, {input: {envvar: env}})
    }
  }

  //Merge Command Line Arguments 
  {
    if (args.length > 0){
      _.merge(kwArgs, argParse(args, argDefs, mode = 'argsonly'))
      _.merge(kwArgs, {input: {cliargs: args}})
    }
  }
  
  return kwArgs
}

async function run (args, argDefs, workerFunction) {
  
  const kwArgs = evaluateVariables(args, argDefs);
  
  let exitcode;

  try{
    exitcode = await workerFunction(kwArgs);
  } catch (err){
    if (err != -1) {
      if (kwArgs.debug && err.stack){
        console.error(err.stack)
      } else {
        console.error(err)
        }
      }
    throw -1
  }

  return exitcode

}

module.exports = {copyFile, disableLine, listFiles, parseJsonFile, startingPrompt,
  sleep, passwordPrompt, capitalize, camelCase, dumpYmlFile, dateSuffix, evaluateVariables, 
  exit, run, runSpawn }