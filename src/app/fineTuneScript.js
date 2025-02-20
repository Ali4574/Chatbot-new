import fs from "fs";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });


async function createFineTuneJob() {
    try {
      // Step 1: Upload training file
      const trainingFile = await openai.files.create({
        file: fs.createReadStream('trainingData.jsonl'),
        purpose: 'fine-tune'
      });
  
      console.log(`File uploaded. ID: ${trainingFile.id}`);
  
      // Step 2: Create fine-tuning job
      const fineTuneJob = await openai.fineTuning.jobs.create({
        training_file: trainingFile.id,
        model: 'gpt-4o-mini', // or another base model
        // hyperparameters: {
        //   n_epochs: 4
        // }
      });
  
      console.log(`Fine-tune job created. Job ID: ${fineTuneJob.id}`);
      console.log('Monitoring job status...');
  
      // Step 3: Poll job status until completion
      let jobStatus;
      let fineTunedModelId;
      
      do {
        const job = await openai.fineTuning.jobs.retrieve(fineTuneJob.id);
        jobStatus = job.status;
        
        if (jobStatus === 'succeeded') {
          fineTunedModelId = job.fine_tuned_model;
          break;
        }
        
        console.log(`Current status: ${jobStatus}. Checking again in 30 seconds...`);
        await new Promise(resolve => setTimeout(resolve, 30000));
      } while (jobStatus !== 'succeeded' && jobStatus !== 'failed');
  
      if (jobStatus === 'succeeded') {
        console.log(`\nFine-tuning complete! New model ID: ${fineTunedModelId}`);
        return fineTunedModelId;
      } else {
        throw new Error('Fine-tuning job failed');
      }
  
    } catch (error) {
      console.error('Error:', error);
      throw error;
    }
  }
  
  // Run the function
  createFineTuneJob();