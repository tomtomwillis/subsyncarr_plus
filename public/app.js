class SubsyncarrPlusClient {
  constructor() {
    this.ws = null;
    this.state = { currentRun: null, files: [], isRunning: false };
    this.reconnectInterval = 3000;

    this.initWebSocket();
    this.setupEventHandlers();
    this.fetchInitialState();
    this.fetchConfigStatus();
  }

  initWebSocket() {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    this.ws = new WebSocket(`${protocol}//${location.host}/ws`);

    this.ws.onopen = () => {
      console.log('WebSocket connected');
    };

    this.ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      this.handleMessage(msg);
    };

    this.ws.onclose = () => {
      console.log('WebSocket disconnected, reconnecting...');
      setTimeout(() => this.initWebSocket(), this.reconnectInterval);
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
  }

  handleMessage(msg) {
    switch (msg.type) {
      case 'state':
        this.state = msg.data;
        this.render();
        break;
      case 'run:started':
        this.state.currentRun = msg.data;
        this.state.isRunning = true;
        this.render();
        break;
      case 'run:completed':
        this.state.currentRun = msg.data;
        this.state.isRunning = false;
        this.render();
        this.fetchHistory();
        break;
      case 'run:cancelled':
        this.state.currentRun = msg.data;
        this.state.isRunning = false;
        this.render();
        this.fetchHistory();
        break;
      case 'file:updated':
        this.updateFile(msg.data.file);
        if (msg.data.run) {
          this.state.currentRun = msg.data.run;
        }
        this.render();
        break;
      case 'files:cleared':
        this.state.currentRun = msg.data.currentRun;
        this.state.files = msg.data.files;
        this.render();
        break;
    }
  }

  updateFile(fileData) {
    const index = this.state.files.findIndex((f) => f.file_path === fileData.file_path);
    if (index >= 0) {
      this.state.files[index] = fileData;
    } else {
      this.state.files.push(fileData);
    }
  }

  async fetchInitialState() {
    const response = await fetch('/api/status');
    const data = await response.json();
    this.state = data;
    this.render();
    this.fetchHistory();
  }

  async fetchHistory() {
    const response = await fetch('/api/history');
    const history = await response.json();

    // Fetch file results for each run to calculate engine stats
    const historyWithStats = await Promise.all(
      history.map(async (run) => {
        try {
          const filesResponse = await fetch(`/api/runs/${run.id}`);
          const data = await filesResponse.json();
          return { ...run, files: data.files || [] };
        } catch (error) {
          console.error(`Failed to fetch files for run ${run.id}:`, error);
          return { ...run, files: [] };
        }
      }),
    );

    this.renderHistory(historyWithStats);
  }

  async fetchConfigStatus() {
    try {
      const response = await fetch('/api/config');
      const config = await response.json();
      this.renderConfigStatus(config);
    } catch (error) {
      console.error('Failed to fetch config status:', error);
      this.renderConfigStatus({ isConfigured: false, paths: [], excludePaths: [] });
    }
  }

  renderConfigStatus(config) {
    // Render path status
    const light = document.getElementById('statusLight');
    const label = document.getElementById('statusLabel');
    const paths = document.getElementById('statusPaths');

    if (config.isConfigured) {
      light.className = 'status-light active';
      label.textContent = 'Watching Folders';
      const pathsList = config.paths.join(', ');
      paths.textContent = pathsList;
      paths.title = pathsList; // Show full path on hover
    } else {
      light.className = 'status-light inactive';
      label.textContent = 'No Paths Configured';
      paths.textContent = 'Using default: /scan_dir';
    }

    // Render schedule status
    this.renderScheduleStatus(config.schedule);
  }

  renderScheduleStatus(schedule) {
    const scheduleLabel = document.getElementById('scheduleLabel');
    const scheduleTime = document.getElementById('scheduleTime');

    if (schedule && schedule.enabled) {
      scheduleLabel.textContent = 'Next Scheduled Scan';

      if (schedule.nextRun) {
        const nextRunDate = new Date(schedule.nextRun);
        const now = new Date();
        const diff = nextRunDate - now;

        // Format time until next run
        const timeUntil = this.formatTimeUntil(diff);
        scheduleTime.textContent = `${nextRunDate.toLocaleString()} (${timeUntil})`;
        scheduleTime.title = `Schedule: ${schedule.description}`;

        // Update countdown every minute
        if (this.scheduleUpdateTimer) {
          clearInterval(this.scheduleUpdateTimer);
        }
        this.scheduleUpdateTimer = setInterval(() => {
          this.fetchConfigStatus();
        }, 60000); // Update every minute
      } else {
        scheduleTime.textContent = schedule.description || schedule.cron;
      }
    } else {
      scheduleLabel.textContent = 'Auto-Scan Disabled';
      scheduleTime.textContent = 'Manual runs only';
    }
  }

  formatTimeUntil(milliseconds) {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `in ${days} day${days > 1 ? 's' : ''}`;
    } else if (hours > 0) {
      return `in ${hours} hour${hours > 1 ? 's' : ''}`;
    } else if (minutes > 0) {
      return `in ${minutes} minute${minutes > 1 ? 's' : ''}`;
    } else {
      return 'very soon';
    }
  }

  setupEventHandlers() {
    document.getElementById('startRun').addEventListener('click', () => {
      this.startRun();
    });

    document.getElementById('startCustom').addEventListener('click', () => {
      document.getElementById('customPathModal').classList.remove('hidden');
      document.getElementById('customPaths').value = ''; // Clear previous input
    });

    document.getElementById('stopRun').addEventListener('click', () => {
      this.stopRun();
    });

    document.getElementById('closeModal').addEventListener('click', () => {
      console.log('Close button clicked');
      document.getElementById('customPathModal').classList.add('hidden');
      document.getElementById('customPaths').value = '';
    });

    document.getElementById('cancelCustom').addEventListener('click', () => {
      document.getElementById('customPathModal').classList.add('hidden');
      document.getElementById('customPaths').value = '';
    });

    document.getElementById('submitCustom').addEventListener('click', () => {
      const paths = document
        .getElementById('customPaths')
        .value.split('\n')
        .map((p) => p.trim())
        .filter((p) => p.length > 0);

      document.getElementById('customPathModal').classList.add('hidden');
      document.getElementById('customPaths').value = '';
      this.startRun(paths);
    });

    // Close modal when clicking outside
    document.getElementById('customPathModal').addEventListener('click', (e) => {
      if (e.target.id === 'customPathModal') {
        document.getElementById('customPathModal').classList.add('hidden');
        document.getElementById('customPaths').value = '';
      }
    });

    // Logs modal handlers
    document.getElementById('closeLogsModal').addEventListener('click', () => {
      document.getElementById('logsModal').classList.add('hidden');
    });

    document.getElementById('closeLogsButton').addEventListener('click', () => {
      document.getElementById('logsModal').classList.add('hidden');
    });

    document.getElementById('copyLogs').addEventListener('click', async () => {
      const logsContent = document.getElementById('logsContent').textContent;
      try {
        await navigator.clipboard.writeText(logsContent);
        const btn = document.getElementById('copyLogs');
        const originalText = btn.textContent;
        btn.textContent = '✓ Copied!';
        setTimeout(() => {
          btn.textContent = originalText;
        }, 2000);
      } catch (err) {
        console.error('Failed to copy logs:', err);
        // Fallback method for older browsers or permission issues
        const textArea = document.createElement('textarea');
        textArea.value = logsContent;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        document.body.appendChild(textArea);
        textArea.select();
        try {
          document.execCommand('copy');
          const btn = document.getElementById('copyLogs');
          const originalText = btn.textContent;
          btn.textContent = '✓ Copied!';
          setTimeout(() => {
            btn.textContent = originalText;
          }, 2000);
        } catch (execErr) {
          console.error('Fallback copy also failed:', execErr);
          alert('Failed to copy logs to clipboard');
        }
        document.body.removeChild(textArea);
      }
    });

    // Close logs modal when clicking outside
    document.getElementById('logsModal').addEventListener('click', (e) => {
      if (e.target.id === 'logsModal') {
        document.getElementById('logsModal').classList.add('hidden');
      }
    });

    // Clear completed files
    document.getElementById('clearCompleted').addEventListener('click', () => {
      this.clearCompleted();
    });
  }

  async startRun(paths = null) {
    try {
      const response = await fetch('/api/run/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paths }),
      });

      if (!response.ok) {
        const error = await response.json();
        alert(`Failed to start run: ${error.error}`);
      }
    } catch (error) {
      alert(`Failed to start run: ${error.message}`);
    }
  }

  async stopRun() {
    if (!confirm('Are you sure you want to stop the current run? All processing will be halted.')) {
      return;
    }

    try {
      const response = await fetch('/api/run/stop', {
        method: 'POST',
      });

      if (!response.ok) {
        const error = await response.json();
        alert(`Failed to stop run: ${error.error}`);
      }
    } catch (error) {
      alert(`Failed to stop run: ${error.message}`);
    }
  }

  async skipFile(filePath) {
    try {
      await fetch('/api/file/skip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath }),
      });
    } catch (error) {
      console.error('Failed to skip file:', error);
    }
  }

  async viewLogs(runId) {
    try {
      const response = await fetch(`/api/runs/${runId}/logs`);
      const data = await response.json();

      document.getElementById('logsContent').textContent = data.logs || 'No logs available';
      document.getElementById('logsModal').classList.remove('hidden');
    } catch (error) {
      console.error('Failed to fetch logs:', error);
      alert('Failed to load logs');
    }
  }

  async clearCompleted() {
    if (!confirm('Are you sure you want to clear all completed and skipped files?')) {
      return;
    }

    try {
      const response = await fetch('/api/files/clear', {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error('Failed to clear files');
      }

      // State will be updated via WebSocket message
    } catch (error) {
      console.error('Failed to clear files:', error);
      alert('Failed to clear files');
    }
  }

  render() {
    this.renderProgress();
    this.renderFiles();
    this.updateButtonVisibility();
  }

  updateButtonVisibility() {
    const stopButton = document.getElementById('stopRun');
    const startButton = document.getElementById('startRun');
    const customButton = document.getElementById('startCustom');

    if (this.state.isRunning) {
      stopButton.classList.remove('hidden');
      startButton.classList.add('hidden');
      customButton.classList.add('hidden');
    } else {
      stopButton.classList.add('hidden');
      startButton.classList.remove('hidden');
      customButton.classList.remove('hidden');
    }
  }

  renderProgress() {
    const { currentRun } = this.state;
    const section = document.getElementById('currentRun');

    if (!currentRun || currentRun.status === 'completed') {
      section.classList.add('hidden');
      return;
    }

    section.classList.remove('hidden');

    // Use engine-level progress for more granular updates
    const percent = currentRun.total_engines > 0 ? (currentRun.completed_engines / currentRun.total_engines) * 100 : 0;
    document.getElementById('progressFill').style.width = `${percent}%`;
    document.getElementById('progressText').textContent =
      `${currentRun.completed} / ${currentRun.total_files} files (${Math.round(percent)}%)`;
  }

  renderFiles() {
    const processing = this.state.files.filter((f) => f.status === 'processing');
    const completed = this.state.files.filter((f) => ['completed', 'skipped', 'error'].includes(f.status));

    // Render processing files
    const progressHtml = processing
      .map((file) => {
        const engines = JSON.parse(file.engines);
        return `
        <div class="file-card processing">
          <div class="file-header">
            <div class="file-name">${this.basename(file.file_path)}</div>
            <button class="btn-skip" onclick="client.skipFile('${file.file_path.replace(/'/g, "\\'")}')">
              Skip
            </button>
          </div>
          <div class="engine-status">
            ${file.current_engine ? `⚙️ Working on ${file.current_engine}` : 'Starting...'}
          </div>
          ${this.renderEngineResults(engines)}
        </div>
      `;
      })
      .join('');

    document.getElementById('filesInProgress').innerHTML = progressHtml;

    // Render completed files
    const completedHtml = completed
      .map((file) => {
        const engines = JSON.parse(file.engines);
        return `
        <div class="file-card ${file.status}">
          <div class="file-name">${this.basename(file.file_path)}</div>
          ${this.renderEngineResults(engines)}
        </div>
      `;
      })
      .join('');

    document.getElementById('completedList').innerHTML =
      completedHtml || '<p class="no-data">No completed files yet</p>';
  }

  renderEngineResults(engines) {
    return Object.entries(engines)
      .map(([name, result]) => {
        const icon = result.success ? '✓' : '✗';
        const className = result.success ? 'success' : 'error';
        const duration = (result.duration / 1000).toFixed(1);

        return `
        <div class="engine-result ${className}">
          <span>${icon} ${name}</span>
          <span class="duration">${duration}s</span>
        </div>
      `;
      })
      .join('');
  }

  calculateEngineStats(files) {
    const stats = {
      ffsubsync: { pass: 0, fail: 0 },
      autosubsync: { pass: 0, fail: 0 },
      alass: { pass: 0, fail: 0 },
    };

    files.forEach((file) => {
      try {
        const engines = JSON.parse(file.engines);
        Object.entries(engines).forEach(([engineName, result]) => {
          if (stats[engineName]) {
            if (result.success) {
              stats[engineName].pass++;
            } else {
              stats[engineName].fail++;
            }
          }
        });
      } catch (error) {
        console.error('Error parsing engine data:', error);
      }
    });

    return stats;
  }

  renderEngineCell(engineStats) {
    if (engineStats.pass === 0 && engineStats.fail === 0) {
      return '<td class="engine-cell">-</td>';
    }

    const parts = [];
    if (engineStats.pass > 0) {
      parts.push(`<span class="engine-pass">${engineStats.pass}</span>`);
    }
    if (engineStats.fail > 0) {
      parts.push(`<span class="engine-fail">${engineStats.fail}</span>`);
    }

    return `<td class="engine-cell">${parts.join('/')}</td>`;
  }

  renderHistory(runs) {
    const html = runs
      .map((run) => {
        const duration = run.end_time ? ((run.end_time - run.start_time) / 1000).toFixed(0) + 's' : 'Running...';
        const engineStats = this.calculateEngineStats(run.files || []);

        return `
        <tr>
          <td>${new Date(run.start_time).toLocaleString()}</td>
          <td><span class="status-badge ${run.status}">${run.status}</span></td>
          <td>${run.total_files}</td>
          <td>${run.completed}</td>
          <td>${run.skipped}</td>
          <td>${run.failed}</td>
          ${this.renderEngineCell(engineStats.ffsubsync)}
          ${this.renderEngineCell(engineStats.autosubsync)}
          ${this.renderEngineCell(engineStats.alass)}
          <td>${duration}</td>
          <td>
            <button class="btn-view-logs" onclick="client.viewLogs('${run.id}')">
              📄 View Logs
            </button>
          </td>
        </tr>
      `;
      })
      .join('');

    document.getElementById('historyBody').innerHTML =
      html || '<tr><td colspan="11" class="no-data">No runs yet</td></tr>';
  }

  basename(path) {
    return path.split('/').pop();
  }
}

// Initialize client when DOM is ready
let client;
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    client = new SubsyncarrPlusClient();
  });
} else {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  client = new SubsyncarrClient();
}
