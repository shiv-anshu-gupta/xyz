# COMTRADE File Combiner - Standalone Tool

## 📋 Overview

This is a **separate, independent application** for combining multiple COMTRADE files. It's designed to eventually become a standalone tool or executable, keeping it decoupled from the main COMTRADE Viewer project.

## 🎯 Features

### 1️⃣ **Time Window Based Combining**

- Set a configurable time window (in seconds)
- Files with timestamps within this window are automatically grouped together
- Each group becomes one combined file
- Example:
  ```
  Window = 2 seconds
  File A: 10:00:01
  File B: 10:00:02  ← Within 2 sec → Combined
  File C: 10:00:05  ← Outside window → Separate
  ```

### 2️⃣ **Duplicate Channel Removal**

- Detects channels with identical names across files
- Automatically marks or removes duplicates
- Keeps only one copy of each unique channel

### 3️⃣ **Similar Channel Detection**

- Uses intelligent similarity algorithm to detect nearly identical channels
- Compares:
  - Channel names (using Levenshtein distance)
  - Unit types
  - Data types (Analog/Digital)
- Configurable similarity threshold (0.5 to 1.0)
- Marks similar channels for removal

### 4️⃣ **Visual Preview & Analysis**

- Live preview of files and their metadata
- Shows analysis results before combining
- Displays what will be removed and why
- Summary of combine operations

## 🗂️ Project Structure

```
comtrade-combiner/
├── index.html                 # Main UI
├── styles.css                 # Styling
├── src/
│   ├── app.js                 # Main application logic
│   └── utils/
│       ├── fileParser.js      # Parse CFG/DAT files
│       └── combiner.js        # Combining algorithms
└── README.md                  # This file
```

## 🚀 How to Use

### 1. Open the Application

```bash
# Open index.html in a web browser
# Or serve with: python -m http.server 8000
```

### 2. Upload COMTRADE Files

- Select multiple .cfg and .dat file pairs
- The app automatically matches pairs

### 3. Configure Settings

- **Time Window**: Set how many seconds define a "group"
- **Remove Duplicates**: Enable/disable duplicate removal
- **Remove Similar**: Enable/disable similar channel detection
- **Similarity Threshold**: Adjust what counts as "similar"

### 4. Analyze

- Click "🔍 Analyze Files"
- Review the analysis results
- See which channels will be removed and why

### 5. Combine & Export

- Click "✅ Combine & Export"
- Preview the combined file summary
- Export combined files (to be implemented)

## 🧮 Algorithms

### Time Window Grouping

```javascript
Files: [A(10:00:01), B(10:00:02), C(10:00:05)]
Window: 2 seconds

Result:
Group 1: [A, B] (1 sec apart)
Group 2: [C] (3 sec from B)
```

### Duplicate Detection

```javascript
File A: ["IA", "IB", "IC"]
File B: ["IA", "VA", "VB"]

Duplicates: "IA" (appears in both files)
```

### Similarity Calculation

Combines three factors:

- **Type Match** (30%): Both Analog or both Digital
- **Unit Match** (20%): Same unit (A, V, etc)
- **Name Similarity** (50%): Using Levenshtein distance

Example: "IA" vs "I_A" = 95% similar → Will be removed at 0.95 threshold

## 📊 Example Scenario

**Input:**

```
fault_2024-12-17_10-00-01.cfg/dat
fault_2024-12-17_10-00-02.cfg/dat
fault_2024-12-17_10-01-05.cfg/dat
```

**Settings:**

- Time Window: 2 seconds
- Remove Duplicates: ✓
- Remove Similar: ✓
- Threshold: 0.95

**Analysis Results:**

```
Group 1: 2 files (files 1 & 2)
  Time span: 1 second
  Original: 12 channels
  Duplicates removed: 3
  Similar removed: 1
  Final: 8 channels

Group 2: 1 file (file 3)
  Time span: 0 seconds
  Original: 12 channels
  Duplicates removed: 0
  Similar removed: 0
  Final: 12 channels
```

## 🔧 Technical Details

### FileParser (`fileParser.js`)

- `parseCFG()`: Extracts metadata, channels, timestamp
- `parseDAT()`: Reads binary data, gets file size info
- `matchFilePairs()`: Matches .cfg with .dat files

### Combiner (`combiner.js`)

- `groupByTimeWindow()`: Groups files by timestamp proximity
- `findDuplicateChannels()`: Identifies duplicate channels
- `findSimilarChannels()`: Detects nearly identical channels
- `calculateChannelSimilarity()`: Computes similarity score
- `getLevenshteinDistance()`: String distance algorithm
- `prepareCombinedFile()`: Prepares merged metadata

### App (`app.js`)

- Orchestrates UI interactions
- Calls parser and combiner utilities
- Manages state and display updates
- Handles export preparation

## 🎨 UI Components

- **Settings Panel** (Left): Configuration and controls
- **Preview Panel** (Right): Results and analysis
- **Status Bar** (Bottom): Real-time feedback
- **Modal**: Detailed export summary

## 🔌 Integration with Main Project

When ready to integrate into the main project:

1. **Copy** the core logic from `src/utils/`
2. **Adapt** the file parsing to use existing parsers
3. **Embed** the combiner window as a modal in main app
4. **Share** the combining utilities with main codebase

**Important**: Keep this separate until integration time!

## 📝 Future Enhancements

- [ ] Add actual file export (CFG/DAT writing)
- [ ] Build to standalone Electron app
- [ ] Create EXE installer
- [ ] Add more similarity metrics (statistical analysis)
- [ ] Batch processing
- [ ] User profiles for common settings
- [ ] Output validation

## 📄 License

Same as main COMTRADE Viewer project

## ✅ Status

**Phase**: Prototype / Dummy Implementation

- ✅ UI & settings
- ✅ Time window grouping
- ✅ Duplicate detection
- ✅ Similarity detection
- ⏳ File export (to be implemented)
- ⏳ Integration with main project

---

**Note**: This is an independent tool. Modify and test here before integrating into `src/main.js`.
