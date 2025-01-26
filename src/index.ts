import { basename } from 'path';
import { findAllSrtFiles } from './findAllSrtFiles';
import { findMatchingVideoFile } from './findMatchingVideoFile';
import { generateFfsubsyncSubtitles } from './generateFfsubsyncSubtitles';
import { generateAutosubsyncSubtitles } from './generateAutosubsyncSubtitles';
import { getScanConfig } from './config';

const SCAN_DIR = '/scan_dir';

async function main(): Promise<void> {
  const scanDir = SCAN_DIR;
  console.log(`${new Date().toLocaleString()} scanning ${scanDir} for .srt files (this could take a while)...`);

  try {
    // Find all .srt files
    const scanConfig = getScanConfig();
    const srtFiles = await findAllSrtFiles(scanConfig);
    console.log(`${new Date().toLocaleString()} Found ${srtFiles.length} SRT files`);

    // Process each SRT file
    for (const srtFile of srtFiles) {
      const videoFile = findMatchingVideoFile(srtFile);

      if (videoFile) {
        const ffsubsyncResult = await generateFfsubsyncSubtitles(srtFile, videoFile);
        console.log(`${new Date().toLocaleString()} ffsubsync result: ${ffsubsyncResult.message}`);
        const autosubsyncResult = await generateAutosubsyncSubtitles(srtFile, videoFile);
        console.log(`${new Date().toLocaleString()} autosubsync result: ${autosubsyncResult.message}`);
      } else {
        console.log(`${new Date().toLocaleString()} No matching video file found for: ${basename(srtFile)}`);
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error:', errorMessage);
  }
}

main();
