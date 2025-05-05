import { useEffect, useRef, useState } from 'react';
import fs from 'fs';
import path from 'path';

export async function getStaticProps() {
  const filePath = path.join(process.cwd(), 'data', 'videos.json');
  const fileContents = fs.readFileSync(filePath, 'utf8');
  const videos = JSON.parse(fileContents).videos;
  return { props: { videos } };
}

export default function Home({ videos: initialVideos }) {
  const [videos, setVideos] = useState(initialVideos);
  const [displayedVideos, setDisplayedVideos] = useState(initialVideos);
  const [currentVideo, setCurrentVideo] = useState(0);
  const [isStarted, setIsStarted] = useState(false);
  const [formData, setFormData] = useState({
    celebrityName: '',
    title: '',
    description: '',
    customScript: '',
    videoUrl: ''
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState(null);
  const videoRefs = useRef([]);

  useEffect(() => {
    if (!isStarted || displayedVideos.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const video = entry.target;
          const index = videoRefs.current.indexOf(video);
          if (entry.isIntersecting && index !== -1) {
            video.play().catch((error) => {
              console.error('Autoplay failed:', error);
            });
            setCurrentVideo(index);
          } else {
            video.pause();
            video.currentTime = 0;
          }
        });
      },
      { threshold: 0.7 }
    );

    videoRefs.current.forEach((video, index) => {
      if (video && video instanceof Element) {
        observer.observe(video);
      } else {
        console.warn(`Skipping invalid ref at index ${index}:`, video);
      }
    });

    return () => {
      observer.disconnect();
    };
  }, [isStarted, displayedVideos]);

  useEffect(() => {
    console.log('Videos state updated:', videos);
    console.log('Displayed videos:', displayedVideos);
  }, [videos, displayedVideos]);

  const handleSearch = (e) => {
    const query = e.target.value.toLowerCase();
    setSearchQuery(query);
    videoRefs.current = Array(displayedVideos.length).fill(null);
    let filtered = videos;
    if (query.trim() === '') {
      setDisplayedVideos(videos);
    } else {
      filtered = videos.filter((video) =>
        video.celebrityName.toLowerCase().includes(query)
      );
      setDisplayedVideos(filtered);
    }
    console.log('Search query:', query, 'Filtered videos:', filtered);
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
      videoUrl: name === 'celebrityName' ? `/videos/${value.toLowerCase().replace(/\s+/g, '-')}-history.mp4` : prev.videoUrl
    }));
  };

  const pollVideo = async (videoUrl, maxAttempts = 180, interval = 5000) => {
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const response = await fetch(videoUrl);
        if (response.ok) {
          console.log(`Video found: ${videoUrl}`);
          return true;
        }
      } catch (err) {
        console.log(`Video not ready: ${videoUrl}`);
      }
      await new Promise(resolve => setTimeout(resolve, interval));
    }
    throw new Error('Video generation timed out');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    const existingVideo = videos.find(
      (video) => video.celebrityName.toLowerCase() === formData.celebrityName.toLowerCase()
    );

    if (existingVideo) {
      setDisplayedVideos([existingVideo]);
      setFormData({
        celebrityName: '',
        title: '',
        description: '',
        customScript: '',
        videoUrl: ''
      });
      console.log('Existing video found:', existingVideo);
      return;
    }

    setIsGenerating(true);
    try {
      const response = await fetch('/api/generate-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to initiate video generation');
      }

      const newVideo = await response.json();
      setVideos((prev) => [...prev, newVideo]);
      await pollVideo(newVideo.videoUrl);
      setDisplayedVideos((prev) => [...prev, newVideo]);
      setFormData({
        celebrityName: '',
        title: '',
        description: '',
        customScript: '',
        videoUrl: ''
      });
      console.log('New video added:', newVideo);
    } catch (err) {
      console.error('Submit error:', err.message);
      setError(err.message);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="reel-container">
      {!isStarted ? (
        <div className="start-screen">
          <h1>Welcome to Sports Reels!</h1>
          <button onClick={() => setIsStarted(true)}>Start Reels</button>
        </div>
      ) : (
        <>
          <div className="form-container">
            <h2>Create or Search Sports Reels</h2>
            <div className="search-container">
              <label>
                Search Celebrity:
                <input
                  type="text"
                  value={searchQuery}
                  onChange={handleSearch}
                  placeholder="e.g., Lionel Messi"
                />
              </label>
            </div>
            <form onSubmit={handleSubmit}>
              <label>
                Celebrity Name:
                <input
                  type="text"
                  name="celebrityName"
                  value={formData.celebrityName}
                  onChange={handleInputChange}
                  required
                />
              </label>
              <label>
                Title:
                <input
                  type="text"
                  name="title"
                  value={formData.title}
                  onChange={handleInputChange}
                  required
                />
              </label>
              <label>
                Description:
                <input
                  type="text"
                  name="description"
                  value={formData.description}
                  onChange={handleInputChange}
                  required
                />
              </label>
              <label>
                Custom Script (Narration):
                <textarea
                  name="customScript"
                  value={formData.customScript}
                  onChange={handleInputChange}
                  required
                />
              </label>
              <label>
                Video URL (auto-generated):
                <input
                  type="text"
                  name="videoUrl"
                  value={formData.videoUrl}
                  readOnly
                />
              </label>
              <button type="submit" disabled={isGenerating}>
                {isGenerating ? 'Generating...' : 'Generate Reel'}
              </button>
              {error && <p className="error">{error}</p>}
            </form>
          </div>
          {displayedVideos.length === 0 && searchQuery && (
            <p className="no-results">No videos found for "{searchQuery}"</p>
          )}
          {displayedVideos.map((video, index) => (
            <div key={video.id} className="reel-item">
              <video
                ref={(el) => (videoRefs.current[index] = el)}
                src={video.videoUrl}
                controls
                loop
                playsInline
                className="reel-video"
              />
              <div className="overlay">
                <h2>{video.title}</h2>
                <p>{video.description}</p>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}