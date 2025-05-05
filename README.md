# Sports Reels

This project creates AI-generated history videos for sports celebrities and displays them in a TikTok-style reel format using Next.js.

## Prerequisites

- Node.js (v14 or higher)
- Python 3.x
- Unsplash API access key
- GitHub personal access token

## Setup Instructions

1. **Clone the repository or extract the zip file.**

2. **Navigate to the project folder:**  

   ```bash
   cd sports-reels
   ```

3. **Install Node.js dependencies:**  

   ```bash
   npm install
   ```

4. **Set up Python environment:**  
   - Install required libraries:

   ```bash
   pip install transformers moviepy gtts requests torch
   ```

5. **Generate videos:**  
   - Run the Python script to create videos:

   ```bash
   python generate_videos.py
   ```

   - This will generate messi-history.mp4 and serena-history.mp4 in the public/videos/ folder.

6. **Start the Next.js app:**  

   ```bash
   npm run dev
   ```

7. **Access the app:**  
   - Open your browser and go to <http://localhost:3000>
