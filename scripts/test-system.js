#!/usr/bin/env node

const http = require('http');
const { execSync } = require('child_process');

const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m'
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function checkService(name, host, port, path = '/health') {
    return new Promise((resolve) => {
        const options = {
            hostname: host,
            port: port,
            path: path,
            method: 'GET',
            timeout: 3000
        };

        const req = http.request(options, (res) => {
            if (res.statusCode === 200) {
                log(`✓ ${name} (${host}:${port})`, 'green');
                resolve(true);
            } else {
                log(`✗ ${name} - HTTP ${res.statusCode}`, 'red');
                resolve(false);
            }
        });

        req.on('error', () => {
            log(`✗ ${name} - Not running`, 'red');
            resolve(false);
        });

        req.on('timeout', () => {
            log(`✗ ${name} - Timeout`, 'yellow');
            req.destroy();
            resolve(false);
        });

        req.end();
    });
}

async function checkBuild() {
    log('\nChecking build artifacts...', 'blue');
    
    const packages = ['shared', 'agent', 'collector', 'processor', 'api', 'ui'];
    let allBuilt = true;

    for (const pkg of packages) {
        const fs = require('fs');
        const distPath = `./packages/${pkg}/dist`;
        
        if (fs.existsSync(distPath)) {
            log(`✓ @hermes/${pkg} - Built`, 'green');
        } else {
            log(`✗ @hermes/${pkg} - Not built`, 'red');
            allBuilt = false;
        }
    }

    return allBuilt;
}

async function checkDocker() {
    log('\nChecking Docker services...', 'blue');
    
    try {
        execSync('docker ps', { stdio: 'ignore' });
        
        const postgresRunning = execSync('docker ps --filter "name=hermes-postgres" --format "{{.Names}}"')
            .toString().trim();
        const redisRunning = execSync('docker ps --filter "name=hermes-redis" --format "{{.Names}}"')
            .toString().trim();

        if (postgresRunning) {
            log('✓ PostgreSQL (Docker)', 'green');
        } else {
            log('✗ PostgreSQL - Not running', 'yellow');
        }

        if (redisRunning) {
            log('✓ Redis (Docker)', 'green');
        } else {
            log('✗ Redis - Not running', 'yellow');
        }

        return postgresRunning && redisRunning;
    } catch (error) {
        log('✗ Docker not available', 'yellow');
        return false;
    }
}

async function checkServices() {
    log('\nChecking running services...', 'blue');
    
    const results = await Promise.all([
        checkService('Collector', 'localhost', 4000),
        checkService('API', 'localhost', 3000),
        checkService('UI', 'localhost', 3001, '/')
    ]);

    return results.every(r => r);
}

async function main() {
    log('╔═══════════════════════════════════════╗', 'blue');
    log('║  Hermes Observability - Test Suite   ║', 'blue');
    log('╚═══════════════════════════════════════╝', 'blue');

    const buildOk = await checkBuild();
    const dockerOk = await checkDocker();
    const servicesOk = await checkServices();

    log('\nSummary:', 'blue');
    log(`   Build: ${buildOk ? '✓' : '✗'}`, buildOk ? 'green' : 'red');
    log(`   Docker: ${dockerOk ? '✓' : '✗'}`, dockerOk ? 'green' : 'yellow');
    log(`   Services: ${servicesOk ? '✓' : '✗'}`, servicesOk ? 'green' : 'yellow');

    if (buildOk && dockerOk && servicesOk) {
        log('\nAll systems operational!', 'green');
        log('\nAccess points:', 'blue');
        log('   Dashboard: http://localhost:3001');
        log('   API:       http://localhost:3000');
        log('   Collector: http://localhost:4000');
        process.exit(0);
    } else {
        log('\nSome components need attention', 'yellow');

        if (!buildOk) {
            log('\nRun: npm run build', 'yellow');
        }
        if (!dockerOk) {
            log('\nRun: npm run docker:up', 'yellow');
        }
        if (!servicesOk) {
            log('\nStart services manually or check QUICKSTART.md', 'yellow');
        }
        
        process.exit(1);
    }
}

main().catch(console.error);
