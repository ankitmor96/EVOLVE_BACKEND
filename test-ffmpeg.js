
const ffmpeg = require('fluent-ffmpeg');

ffmpeg.getAvailableFormats((err, formats) => {
  if (err) {
    console.error('FFmpeg Error:', err.message);
    return;
  }

  console.log('FFmpeg connected successfully!');
  console.log('Available formats:', Object.keys(formats).length);
});
