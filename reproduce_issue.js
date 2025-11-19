
// Mock EMMCollectTag interface structure
// interface EMMCollectTag {
// 	id: string;
// 	letter: string;
// 	tag: string;
// 	color: string;
// 	display: string;
// }

// The function to test
function isCollectTagHelper(tag, collectTags) {
    const normalize = (value) => value ? value.trim().toLowerCase() : '';
    const inputNormalized = normalize(tag);
    const hasCategory = tag.includes(':');
    const [inputCategoryRaw, inputTagRaw] = hasCategory ? tag.split(':', 2) : ['', tag];
    const inputCategoryNormalized = normalize(inputCategoryRaw);
    const inputTagOnlyNormalized = normalize(inputTagRaw);

    console.log(`[Test] Checking tag: "${tag}"`);
    // console.log(`[Debug] Normalized: "${inputNormalized}", Cat: "${inputCategoryNormalized}", Tag: "${inputTagOnlyNormalized}"`);

    for (const ct of collectTags) {
        const idNormalized = normalize(ct.id);
        const displayNormalized = normalize(ct.display);
        const tagNormalized = normalize(ct.tag);
        const letterNormalized = normalize(ct.letter);

        // Parse category from display if possible
        const displayHasCategory = ct.display?.includes(':');
        const [displayCategoryRaw, displayTagRaw] = displayHasCategory ? ct.display.split(':', 2) : ['', ct.display];
        const displayCategoryNormalized = normalize(displayCategoryRaw);
        const displayTagNormalized = normalize(displayTagRaw);

        // 1. Exact Match (ID or Display)
        if (idNormalized && idNormalized === inputNormalized) return ct;
        if (displayNormalized && displayNormalized === inputNormalized) return ct;

        // 2. Tag Name Match (most common case)
        // If the input is just "tag", match against ct.tag
        if (!hasCategory && tagNormalized === inputNormalized) return ct;

        // 3. Category:Tag Match
        if (hasCategory) {
            // Match against Display (category:tag)
            if (displayHasCategory && displayCategoryNormalized === inputCategoryNormalized && displayTagNormalized === inputTagOnlyNormalized) return ct;

            // Match against Letter:Tag (e.g. "f:stirrup legwear")
            if (letterNormalized && letterNormalized === inputCategoryNormalized && tagNormalized === inputTagOnlyNormalized) return ct;

            // Match against Tag only (ignoring category if tag name is unique enough or user wants loose matching)
            if (tagNormalized === inputTagOnlyNormalized) return ct;
        }
    }

    return null;
}

// Mock Data
const mockCollectTags = [
    {
        id: "female:stirrup legwear",
        letter: "f",
        tag: "stirrup legwear",
        color: "#ff0000",
        display: "female:stirrup legwear"
    },
    {
        id: "loli",
        letter: "",
        tag: "loli",
        color: "#00ff00",
        display: "loli"
    },
    {
        id: "character:asuka langley soryu",
        letter: "c",
        tag: "asuka langley soryu",
        color: "#0000ff",
        display: "character:asuka langley soryu"
    }
];

// Test Cases
const testCases = [
    "stirrup legwear",
    "female:stirrup legwear",
    "f:stirrup legwear",
    "STIRRUP LEGWEAR", // Case insensitive
    "loli",
    "LOLI",
    "asuka langley soryu",
    "character:asuka langley soryu",
    "c:asuka langley soryu",
    "unknown tag",
    "female:unknown"
];

console.log("=== Starting Test ===\n");

testCases.forEach(input => {
    const result = isCollectTagHelper(input, mockCollectTags);
    if (result) {
        console.log(`✅ MATCH: "${input}" -> ${result.display} (Color: ${result.color})`);
    } else {
        console.log(`❌ NO MATCH: "${input}"`);
    }
});

console.log("\n=== Test Finished ===");
