# Eco-Nesting 🌿

Eco-Nesting is a powerful tool designed to optimize the layout of garment pieces on fabric, significantly reducing material waste. It uses advanced image processing and nesting algorithms to provide the most efficient arrangement for production.

## 🚀 Features

- **Automated Image Processing**: Quickly extract shapes from images using OpenCV.
- **Efficient Nesting Algorithms**: Leverages multiple optimization strategies (rectpack, greedy, etc.) to minimize cut area.
- **Interactive Canvas**: Drag, drop, and rotate pieces for fine-tuning using a React-based frontend.
- **Fabric Constraint Support**: Account for fabric width, height, and custom boundary constraints.
- **Real-time Metrics**: View efficiency percentages and material savings immediately.

## 🛠️ Tech Stack

- **Frontend**: React, Vite, Fabric.js, Tailwind CSS, Axios.
- **Backend**: FastAPI, OpenCV, NumPy, Shapely, Rectpack, Uvicorn.

---

## 🏃 Getting Started

To run this project on your local machine, follow these steps:

### Prerequisites

- [Python 3.8+](https://www.python.org/downloads/)
- [Node.js 16+](https://nodejs.org/)
- npm or yarn

### 1. Clone the Repository
```bash
git clone https://github.com/Jeevs170805/Eco-Nesting.git
cd Eco-Nesting
```

### 2. Backend Setup
Navigate to the backend directory and install the necessary Python packages.

```bash
cd backend
pip install -r requirements.txt
```

**Run the Backend Server:**
```bash
python main.py
```
The API will be available at `http://localhost:8000`.

### 3. Frontend Setup
Open a new terminal, navigate to the frontend directory, and install dependencies.

```bash
cd frontend
npm install
```

**Run the Frontend App:**
```bash
npm run dev
```
The application will be available at `http://localhost:5173`.

---

## 📁 Project Structure

```text
Eco-Nesting/
├── backend/            # FastAPI Backend
│   ├── main.py         # Entry point & API routes
│   ├── nester.py       # Optimization logic
│   ├── image_processor.py # Image processing utilities
│   └── requirements.txt # Python dependencies
├── frontend/           # React Frontend
│   ├── src/            # Components & Logic
│   ├── package.json    # JS dependencies
│   └── vite.config.js  # Vite configuration
└── .gitignore          # Git exclusion rules
```

## 🤝 Contributing
Feel free to open issues or submit pull requests to help improve Eco-Nesting!
