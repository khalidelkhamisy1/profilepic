# Pharmacy EPNU EXPO v.2 — Profile Frame App

A sleek, responsive, and fast web application built to allow users to automatically place their personal photos inside the **Pharmacy EPNU EXPO v.2 Cosmo Day** event frame.

## 🌟 Features

- **Drag & Drop Upload:** Easily upload photos (JPG, PNG, WEBP) by clicking or dragging and dropping into the drop zone.
- **Interactive Preview:** Instantly preview your photo underneath the transparent event frame.
- **Image Controls:** Drag to reposition your photo inside the frame and use the slider to zoom in or out.
- **High-Quality Export:** Combine your photo and the frame using an HTML Canvas, generating a high-resolution 1080x1080px PNG.
- **100% Private & Local:** All image processing is done locally in your browser. No images are uploaded to any server.
- **Modern UI:** Built with Tailwind CSS, featuring a beautiful glassmorphism aesthetic and a rose gold/blush pink color theme matching the event's vibe.
- **Fully Responsive:** Beautifully scaled for both mobile and desktop users.

## 🛠️ Technologies Used

- **React 18**
- **Vite**
- **Tailwind CSS v4**
- **Vanilla CSS (for animations & specific styles)**

## 🚀 Getting Started

### Prerequisites
Make sure you have [Node.js](https://nodejs.org/) installed on your machine.

### Installation

1. Clone or download this project to your computer.
2. Open your terminal and navigate to the project directory:
   ```bash
   cd "profile-frame-app"
   ```
3. Install the dependencies:
   ```bash
   npm install
   ```
4. Start the development server:
   ```bash
   npm run dev
   ```
5. Open your browser and navigate to `http://localhost:5173/`.

## 🎨 Customization

It's easy to reuse this template for future events!

1. **Changing the Frame:**
   Simply replace the `public/frame.png` file with your new transparent PNG frame. The frame should ideally be square (1:1 ratio) to match the export dimensions.

2. **Changing the Title/Logo:**
   Replace the `public/title.png` file with your event's logo or title image.

3. **Changing Colors & Theme:**
   Open `src/index.css` and modify the CSS variables under `:root` to change the application's color scheme (buttons, backgrounds, sliders, etc.).

4. **Changing Export Size:**
   Open `src/App.jsx` and change the `EXPORT_SIZE` constant at the top of the file. By default, it's set to `1080` (for 1080x1080px output).

## 📁 Project Structure

```
profile-frame-app/
├── public/                 # Static assets
│   ├── frame.png           # Transparent event frame overlay
│   ├── title.png           # Event title logo image
│   └── bg.png              # Background design reference
├── src/
│   ├── App.jsx             # Main Application Component (logic & UI)
│   ├── main.jsx            # React mounting point
│   └── index.css           # Tailwind + Custom styling and animations
├── index.html              # HTML entry point (SEO + Google Fonts)
├── package.json            # Project dependencies and scripts
├── vite.config.js          # Vite configuration
└── README.md               # Project documentation
```
