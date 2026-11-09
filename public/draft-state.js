// Keeps late results from one dialog/input revision out of another.
export function createDraftState(){
 let revision=0,busy=false,controller;
 return {
  invalidate(){revision++;busy=false;controller?.abort();controller=undefined;},
  begin(){controller?.abort();controller=new AbortController();busy=true;return {revision:++revision,signal:controller.signal};},
  current(ticket){return busy&&ticket.revision===revision&&!ticket.signal.aborted;},
  finish(ticket){if(ticket.revision===revision){busy=false;controller=undefined;}},
  get busy(){return busy;}
 };
}
