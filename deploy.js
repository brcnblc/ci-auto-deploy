const initDeploy = require('./deploy_functions');
const argParse = require('./argParse');
const argDefinitions = require('./arguments.json');
const Print = require('./library').Print.prototype;
const print = function (txt){Print.print(txt)};

async function run (argString) {

  //Parse Args
  let kwArgs = {};
  try {kwArgs = argParse(argString, argDefinitions);}
  catch (err){
    print(err);
    print(`Check Command Line Options :`);
    print(`${argString}`);
    process.exit(1);
  }

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

  function exit(exitCode){
    if (exitCode == 0){
      console.log('Process exited succesfully.');
    }
    else {
      console.error('Process exited with exit code', exitCode);
    }

    process.exit(exitCode);
  }

}