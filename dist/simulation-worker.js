import {simulate} from './model.js';
self.onmessage=({data})=>{try{const result=simulate(data.state,data.iterations,data.seed,p=>self.postMessage({progress:p}));self.postMessage({result});}catch(e){self.postMessage({error:e.message});}};
