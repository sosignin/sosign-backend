import fs from 'fs';
import path from 'path';
import lighthouse from 'lighthouse';
import * as chromeLauncher from 'chrome-launcher';

async function runAudit(url) {
  // 1. Launch a headless Chrome instance
  const chrome = await chromeLauncher.launch({
    chromeFlags: ['--headless', '--disable-gpu', '--no-sandbox']
  });

  // 2. Configure Lighthouse options
  const options = {
    logLevel: 'info',
    output: 'html',
    port: chrome.port,
    onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
  };

  console.log(`🚀 Starting Lighthouse audit for: ${url}`);
  
  // 3. Execute the audit
  const runnerResult = await lighthouse(url, options);

  // Save the report in the backend folder
  const reportPath = path.join(process.cwd(), 'lighthouse-report.html');
  fs.writeFileSync(reportPath, runnerResult.report);
  console.log(`💾 Report successfully saved to: ${reportPath}`);

  // Extract scores
  const scores = runnerResult.lhr.categories;
  
  console.log('\n📊 Audit Scores:');
  console.log(`- Performance: ${(scores.performance.score * 100).toFixed(0)}`);
  console.log(`- Accessibility: ${(scores.accessibility.score * 100).toFixed(0)}`);
  console.log(`- Best Practices: ${(scores['best-practices'].score * 100).toFixed(0)}`);
  console.log(`- SEO: ${(scores.seo.score * 100).toFixed(0)}`);

  // Print failing SEO audits
  console.log('\n🔍 Failing SEO Audits:');
  const seoAudits = scores.seo.auditRefs || [];
  const audits = runnerResult.lhr.audits;
  
  seoAudits.forEach(ref => {
    const audit = audits[ref.id];
    if (audit && audit.score !== 1) {
      console.log(`❌ [${audit.title}]`);
      console.log(`   Description: ${audit.description?.replace(/\[Learn more\].*/g, '')}`);
      if (audit.displayValue) {
        console.log(`   Value: ${audit.displayValue}`);
      }
    }
  });

  // 4. Always close the Chrome process when finished
  await chrome.kill();
}

const url = process.argv[2] || 'http://127.0.0.1:3000';
runAudit(url).catch(console.error);
