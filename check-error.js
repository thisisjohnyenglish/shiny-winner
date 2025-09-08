const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

async function evaluateP5Sketch(htmlFilePath) {
    let browser;
    const errors = [];
    const consoleErrors = [];

    // 1. Check if the file exists
    if (!fs.existsSync(htmlFilePath)) {
        console.error(`Error: HTML file not found at ${htmlFilePath}`);
        return { success: false, message: `HTML file not found: ${htmlFilePath}` };
    }

    // Convert file path to a file URL for Puppeteer
    const fileUrl = `file://${path.resolve(htmlFilePath)}`;
    console.log(`Evaluating P5.js sketch from: ${fileUrl}`);

    try {
        // 2. Launch Puppeteer
        browser = await puppeteer.launch({
            headless: true, // Use 'new' for latest headless mode, 'true' for older stable
            args: ['--no-sandbox', '--disable-setuid-sandbox'] // Recommended for container environments
        });
        const page = await browser.newPage();

        // 3. Listen for uncaught exceptions (e.g., ReferenceError, TypeError)
        page.on('pageerror', (err) => {
            console.error('Page error (uncaught exception):', err.message);
            errors.push({ type: 'pageerror', message: err.message, stack: err.stack });
        });

        // 4. Listen for console messages, especially errors logged by P5.js or custom code
        page.on('console', (msg) => {
            const text = msg.text();
            if (msg.type() === 'error') {
                // Filter out common Puppeteer/browser internal errors if necessary
                if (!text.includes('Failed to load resource')) { // Example filter
                    process.stderr.write('Console error: ' + text + '\n');
                    consoleErrors.push({ type: 'console.error', message: text });
                }
            } else if (msg.type() === 'warning') {
                process.stderr.write('Console warning: ' + text + '\n');
            } else if (msg.type() === 'log') {
                process.stderr.write('Console log: ' + text + '\n');
            }
        });
        // 5. Navigate to the local HTML file
        // `waitUntil: 'domcontentloaded'` waits until the DOM is parsed.
        // A timeout is important to prevent hanging on unresponsive pages.
        await page.goto(fileUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }); // 30 seconds timeout

        // 6. Give the P5.js sketch some time to run and potentially throw errors.
        // Most setup-related errors or immediate draw errors will occur within a few seconds.
        await new Promise(resolve => setTimeout(resolve, 5000)); // Wait for 5 seconds

        const allErrors = [...errors, ...consoleErrors];

        // 7. Report findings
        if (allErrors.length > 0) {
            console.log(`Evaluation complete: Found ${allErrors.length} runtime errors.`);
            return {
                success: false,
                message: 'Runtime errors detected.',
                errors: allErrors
            };
        } else {
            console.log('Evaluation complete: No runtime errors detected.');
            return {
                success: true,
                message: 'No runtime errors detected.'
            };
        }

    } catch (error) {
        // Catch any Puppeteer-related errors or navigation failures
        console.error('Puppeteer or navigation error:', error);
        return {
            success: false,
            message: `Puppeteer or navigation error: ${error.message}`,
            errors: [{ type: 'puppeteer_error', message: error.message, stack: error.stack }]
        };
    } finally {
        // Always close the browser
        if (browser) {
            await browser.close();
        }
    }
}

// Command-line interface for the evaluator
if (require.main === module) {
    const htmlFilePath = process.argv[2];

    if (!htmlFilePath) {
        console.error('Usage: node index.js <path/to/your/p5_sketch.html>');
        process.exit(1); // Indicate incorrect usage
    }

    evaluateP5Sketch(htmlFilePath)
        .then(result => {
            console.log('\n--- Final Evaluation Result ---');
            console.log(JSON.stringify(result, null, 2));
            if (!result.success) {
                process.exit(1); // Indicate failure
            } else {
                process.exit(0); // Indicate success
            }
        })
        .catch(err => {
            console.error('Unhandled error during evaluation:', err);
            process.exit(1); // Indicate critical failure
        });

}

