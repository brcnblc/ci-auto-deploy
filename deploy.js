const initDeploy = require('./deploy_functions');
const argParse = require('./argParse');
const argDefinitions = require('./arguments.json');
const Print = require('./library').Print.prototype;
const print = function (txt){Print.print(txt)};
const { evaluateYaml, parseYmlFile } = require('./helper')
const _ = require('lodash')

function parseArgs(argString, argDefinitions, mode){
  try {
    return argParse(argString, argDefinitions, mode)
    }
  catch (err){
    console.error(err);
    if (!err.includes('Error: Unknown parse mode')){
      console.error(`Check Command Line Options :`);
      console.error(`${argString}`);
    }
    process.exit(1);
  }

}

function evaluateVariables(argString){
  
  let kwArgs = {};

  //Parse Defaults with command line arguments
  _.merge(kwArgs, parseArgs(argString, argDefinitions))

  
  //Merge configuartion file defaults
  { 
    const configFile = kwArgs.configFile
    const configContent = parseYmlFile(configFile, raiseOnError = false)

    // Extract file contents if exists
    if (configContent && configContent.errno == -2){
      console.error (`Error : Configuration file ${configFile} not found.`)
      throw -1
    }
  
    const ci = evaluateYaml(configContent, {args:kwArgs})
    for ([key,value] of Object.entries(ci)){
      _.merge(kwArgs, value)
    }
    _.merge(kwArgs, {input: {globalConfig: ci}})
  }
  
  //Merge Environment Variables
  {
    const env = process.env[kwArgs.environmentVariable]
    if (env && env != ''){
      _.merge(kwArgs, parseArgs(env, argDefinitions, mode = 'argsonly'))
      _.merge(kwArgs, {input: {envvar: env}})
    }
  }

  //Merge Command Line Arguments 
  {
    if (argString && argString != ''){
      _.merge(kwArgs, parseArgs(argString, argDefinitions, mode = 'argsonly'))
      _.merge(kwArgs, {input: {cliargs: argString}})
    }
  }
  
  // Handle all as first argument
  if (kwArgs.cloudProvider == 'all'){
    kwArgs.cloudProvider = "last || aws"
    kwArgs.application = 'all'
  }

  return kwArgs
}

async function run (argString) {

  const kwArgs = evaluateVariables(argString);
  
  let exitcode;

  try{
    exitcode = await initDeploy(kwArgs);
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

module.exports = run;

const __name__ = process.argv[1].split('/').pop();

if (__name__ == 'deploy.js'){
  try{
    //print(`Process : ${process.argv[1]}`)
    run(process.argv.slice(2).join(' '))
    .then(exitCode => exit(exitCode))
    .catch(exitCode => exit(exitCode))

  }
  catch (exitCode) {
    exit(exitCode)
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

}