// ------------------- TAB SWITCHING -------------------

function showTab(tab) {
    ['upload', 'loading', 'results'].forEach(t => {
        document
            .getElementById('tab-' + t)
            .classList.toggle('hidden', t !== tab);
    });
}

// ------------------- FILE EVENTS -------------------

dropzone.addEventListener('dragover', e => {
    e.preventDefault();
});

dropzone.addEventListener('drop', e => {
    e.preventDefault();
    handleFile(e.dataTransfer.files[0]);
});

fileInput.addEventListener('change', e => {
    handleFile(e.target.files[0]);
});

// ------------------- HANDLE FILE -------------------

function handleFile(file) {

    if (!file) return;

    if (file.type !== 'application/pdf') {
        flashError('Only PDF files are allowed.');
        return;
    }

    runFactCheck(file);
}

// ------------------- PDF EXTRACTION -------------------

async function extractPdfText(file) {

    let fullText = "";

    const pdf = await pdfjsLib.getDocument({
        data: await file.arrayBuffer()
    }).promise;

    for (let i = 1; i <= Math.min(pdf.numPages, 25); i++) {

        const page = await pdf.getPage(i);

        const content = await page.getTextContent();

        fullText +=
            content.items.map(item => item.str).join(" ") + "\n";

        if (fullText.length > 18000)
            break;
    }

    return fullText.trim();
}

// ------------------- CLAUDE API -------------------

async function callClaude(promptText) {

    const response = await fetch(
        "https://api.anthropic.com/v1/messages",
        {
            method: "POST",

            headers: {
                "Content-Type": "application/json",

                "x-api-key": YOUR_CLAUDE_API_KEY,

                "anthropic-version": "2023-06-01"
            },

            body: JSON.stringify({

                model: "claude-3-5-sonnet-20241022",

                max_tokens: 4000,

                messages: [
                    {
                        role: "user",
                        content: promptText
                    }
                ]
            })
        });

    const data = await response.json();

    if (data.error)
        throw new Error(data.error.message);

    return data.content[0].text;
}

// ------------------- MAIN FACT CHECK -------------------

async function runFactCheck(file) {

    try {

        showTab('loading');

        document.getElementById("loadingStep")
            .innerText = "Extracting text from PDF...";

        const text = await extractPdfText(file);

        document.getElementById("loadingStep")
            .innerText = "Extracting claims...";

        const extractPrompt = `
Extract all factual claims from the text.

TEXT:
${text}

Return JSON array only.
`;

        const claims = await callClaude(extractPrompt);

        document.getElementById("loadingStep")
            .innerText = "Verifying claims...";

        const verifyPrompt = `
Verify these claims using your knowledge.

CLAIMS:
${claims}

Return JSON format:
[
 {
  "claim":"",
  "status":"",
  "correctInfo":"",
  "source":"",
  "confidence":""
 }
]
`;

        const verification = await callClaude(verifyPrompt);

        const results = JSON.parse(verification);

        renderResults(results);

        showTab('results');

    }

    catch (err) {

        console.error(err);

        flashError(err.message);

        showTab('upload');
    }
}

// ------------------- RENDER RESULTS -------------------

function renderResults(results) {

    const tbody =
        document.getElementById('resultsBody');

    tbody.innerHTML = "";

    results.forEach((r, index) => {

        tbody.innerHTML += `
        <tr>
            <td>${index + 1}</td>

            <td>${r.claim}</td>

            <td>
                ${badgeFor(r.status)}
            </td>

            <td>${r.correctInfo}</td>

            <td>${r.source}</td>

            <td>${r.confidence}%</td>
        </tr>
        `;
    });
}

// ------------------- BADGES -------------------

function badgeFor(status) {

    const s = status.toLowerCase();

    if (s === 'verified')
        return `<span class="badge green">
                    Verified
                </span>`;

    if (s === 'inaccurate')
        return `<span class="badge orange">
                    Inaccurate
                </span>`;

    return `<span class="badge red">
                False
            </span>`;
}

// ------------------- CSV DOWNLOAD -------------------

document
.getElementById('downloadCsvBtn')
.addEventListener('click', () => {

    let rows = [];

    document.querySelectorAll('#resultsBody tr')
        .forEach(tr => {

            let cols = [];

            tr.querySelectorAll('td')
                .forEach(td =>
                    cols.push(td.innerText));

            rows.push(cols);
        });

    const header = [
        "No",
        "Claim",
        "Status",
        "Correct Info",
        "Source",
        "Confidence"
    ];

    const csv =
        [header, ...rows]
        .map(r => r.join(","))
        .join("\n");

    const blob =
        new Blob([csv],
        { type: "text/csv" });

    const url =
        URL.createObjectURL(blob);

    const a =
        document.createElement("a");

    a.href = url;

    a.download = "fact_check_report.csv";

    a.click();

    URL.revokeObjectURL(url);
});

// ------------------- ERROR -------------------

function flashError(msg) {
    alert(msg);
}