// ----------  Command Line Runner With Evaluating Arguments ----------------------------------------
//
// # Author : Bircan Bilici 
// # Github: https://github.com/brcnblc
// # Licence : MIT
//
// Change below according to the running program
const thisFileName = 'awscli.js' // Change here according to executable filename
const workerFunction = require('./aws_functions'); // Change here for specific worker function
const argDefinitions = require('./aws_arg_defs.json'); // Change here for argument definition file
// --------------------------------------------------------------------------------------------------

const { exit , run } = require('./helper')
const directRun = (thisFileName == process.argv[1].split('/').pop()); 

module.exports = run;

if (directRun){
  try{
    const commandLineArgs = process.argv.slice(2)
    run(commandLineArgs, argDefinitions, workerFunction)
    .then(exitCode => exit(exitCode))
    .catch(exitCode => exit(exitCode))
  }
  catch (exitCode) {
    exit(exitCode)
  }
}