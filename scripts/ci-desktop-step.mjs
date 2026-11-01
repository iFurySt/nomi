import {spawnSync} from "node:child_process";
const [command,...args]=process.argv.slice(2);
if(!command)throw Error("Missing CI command");
const result=spawnSync(command,args,{encoding:"utf8",maxBuffer:32*1024*1024,env:process.env});
process.stdout.write(result.stdout ?? "");process.stderr.write(result.stderr ?? "");
if(result.status!==0){
  const lines=((result.stdout??"")+"\n"+(result.stderr??"")).trim().split("\n").slice(-45);
  const message=lines.join("\n").replaceAll("%","%25").replaceAll("\r","%0D").replaceAll("\n","%0A");
  console.error(`::error title=Desktop step failed::${message}`);
  process.exit(result.status??1);
}
