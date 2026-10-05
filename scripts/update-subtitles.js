const fs = require('fs');
const path = './storage/projects/autosave_project.json';
const proj = JSON.parse(fs.readFileSync(path, 'utf-8'));

if (proj.subtitles && proj.subtitles.length >= 3) {
  proj.subtitles[0].khmerText = 'មើលប្រុសគេផង គេចេះយកចិត្តយកថ្លើម មើលមុខឯងវិញ គ្មានបានការសោះ';
  proj.subtitles[0].englishText = "Look at other people's boyfriends, they're total cuties. Look at you, you're hopeless.";
  proj.subtitles[0].voice = 'Sreymom (Female)';

  proj.subtitles[1].khmerText = 'បាទៗ ខ្ញុំវាគ្មានបានការ ចឹងយកល្អឲ្យឯងធ្វើទាំងអស់ហ្មងទៅ';
  proj.subtitles[1].englishText = "Right, right, right, I'm hopeless. Take all the credit yourself then!";
  proj.subtitles[1].voice = 'Piseth (Male)';

  proj.subtitles[2].khmerText = 'ឯងចង់ងាប់ហើយមែនទេ?!';
  proj.subtitles[2].englishText = 'Have you had enough of living?';
  proj.subtitles[2].voice = 'Sreymom (Female)';

  fs.writeFileSync(path, JSON.stringify(proj, null, 2), 'utf-8');
  console.log('✅ Updated autosave_project.json with cinema-grade Khmer dubbing subtitles and voices!');
}
