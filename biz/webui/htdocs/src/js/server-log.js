require('./base-css.js');
require('../css/log.css');
var $ = require('jquery');
var React = require('react');
var ReactDOM = require('react-dom');
var ExpandCollapse = require('./expand-collapse');
var util = require('./util');
var dataCenter = require('./data-center');
var FilterInput = require('./filter-input');
var RecordBtn = require('./record-btn');
var events = require('./events');

var MAX_COUNT = 60;
var MAX_FILE_SIZE = 1024 * 1024 * 2;

var ServerLog = React.createClass({
  getInitialState: function() {
    return { scrollToBottom: true };
  },
  componentDidMount: function() {
    var self = this;
    var svrContainer = this.container = ReactDOM.findDOMNode(self.refs.svrContainer);
    var svrContent = this.content = ReactDOM.findDOMNode(self.refs.svrContent);

    var updateLogs = function(_, svrLogs) {
      var state = self.state;
      var curLogs = state.logs;
      if (curLogs !== svrLogs && Array.isArray(curLogs)) {
        svrLogs.push.apply(svrLogs, curLogs);
      }
      state.logs = svrLogs;
      util.filterLogList(state.logs, self.keyword);
      if (self.props.hide) {
        return;
      }
      var atBottom = util.scrollAtBottom(svrContainer, svrContent);
      if (atBottom) {
        var len = svrLogs.length - MAX_COUNT;
        len > 9 && util.trimLogList(svrLogs, len, self.keyword);
      }
      self.setState({});
    };
    if (dataCenter.uploadLogs) {
      updateLogs(null, dataCenter.uploadLogs);
      dataCenter.uploadLogs = null;
    }
    events.on('uploadLogs', function(_, result) {
      if (self.props.hide) {
        return;
      }
      var logs = result.logs;
      var curLogs = self.state.logs;
      if (curLogs) {
        curLogs.push.apply(curLogs, logs);
        var overflow = curLogs.length - MAX_COUNT;
        overflow > 19 && util.trimLogList(curLogs, overflow, self.keyword);
      } else {
        curLogs = logs;
      }
      updateLogs(null, curLogs);
    });
    dataCenter.on('log', updateLogs);

    var svrTimeout;
    $(svrContainer).on('scroll', function() {
      var data = self.state.logs;
      svrTimeout && clearTimeout(svrTimeout);
      if (data && (self.state.scrollToBottom = util.scrollAtBottom(svrContainer, svrContent))) {
        svrTimeout = setTimeout(function() {
          var len = data.length - MAX_COUNT;
          if (len > 9) {
            util.trimLogList(data, len, self.keyword);
            self.setState({});
          }
        }, 2000);
      }
    });
  },
  clearLogs: function() {
    var data = this.state.logs;
    data && data.splice(0, data.length);
    this.setState({});
  },
  stopAutoRefresh: function() {
    if (util.scrollAtBottom(this.container, this.content)) {
      this.container.scrollTop = this.container.scrollTop - 10;
    }
  },
  scrollTop: function() {
    this.container.scrollTop = 0;
  },
  autoRefresh: function() {
    this.container.scrollTop = 10000000;
  },
  shouldComponentUpdate: function(nextProps) {
    var hide = util.getBoolean(this.props.hide);
    var toggleHide = hide != util.getBoolean(nextProps.hide);
    if (toggleHide || !hide) {
      if (!toggleHide && !hide) {
        this.state.scrollToBottom = util.scrollAtBottom(this.container, this.content);
      }
      return true;
    }
    return false;
  },
  componentDidUpdate: function() {
    if (!this.props.hide && this.state.scrollToBottom) {
      this.container.scrollTop = 10000000;
    }
  },
  onServerFilterChange: function(keyword) {
    keyword = keyword.trim();
    this.keyword = keyword;
    var serverKeyword = util.parseKeyword(keyword);
    var logs = this.state.logs;
    util.filterLogList(logs, serverKeyword);
    if (!keyword) {
      var len = logs && (logs.length - MAX_COUNT);
      len > 9 && logs.splice(0, len);
    }
    this.setState({
      serverKeyword: serverKeyword
    });
  },
  showNameInput: function(e) {
    var self = this;
    self.setState({
      showNameInput: true
    }, function() {
      ReactDOM.findDOMNode(self.refs.nameInput).focus();
    });
  },
  download: function() {
    var target = ReactDOM.findDOMNode(this.refs.nameInput);
    var name = target.value.trim();
    var logs = [];
    this.state.logs.forEach(function(log) {
      if (!log.hide) {
        logs.push({
          id: log.id,
          text: log.text,
          level: log.level,
          date: log.date
        });
      }
    });
    target.value = '';
    ReactDOM.findDOMNode(this.refs.filename).value = name;
    ReactDOM.findDOMNode(this.refs.content).value = JSON.stringify(logs, null, '  ');
    ReactDOM.findDOMNode(this.refs.downloadForm).submit();
    this.hideNameInput();
  },
  submit: function(e) {
    if (e.keyCode !== 13 && e.type != 'click') {
      return;
    }
    this.download();
  },
  selectFile: function() {
    ReactDOM.findDOMNode(this.refs.importData).click();
  },
  importData: function() {
    var form = new FormData(ReactDOM.findDOMNode(this.refs.importDataForm));
    var file = form.get('importData');
    if (!file || !/\.log$/i.test(file.name)) {
      return alert('Only supports .log file.');
    }
    if (file.size > MAX_FILE_SIZE) {
      return alert('The file size can not exceed 2m.');
    }
    var reader = new FileReader();
    reader.readAsText(file);
    reader.onload = function(){
      var logs = util.parseLogs(this.result);
      if (!logs) {
        return;
      }
      events.trigger('uploadLogs', {logs: logs});
    };
    ReactDOM.findDOMNode(this.refs.importData).value = '';
  },
  preventBlur: function(e) {
    e.target.nodeName != 'INPUT' && e.preventDefault();
  },
  hideNameInput: function() {
    this.setState({ showNameInput: false });
  },
  handleAction: function(type) {
    if (type === 'top') {
      return this.scrollTop();
    }
    if (type === 'bottom') {
      return this.autoRefresh();
    }
    if (type === 'pause') {
      dataCenter.pauseServerLogRecord();
      return;
    }
    var refresh = type === 'refresh';
    dataCenter.stopServerLogRecord(!refresh);
    if (refresh) {
      return this.autoRefresh();
    }
  },
  render: function() {
    var state = this.state;
    var logs = state.logs || [];
    var disabled = !util.hasVisibleLog(logs);

    return (
      <div className={'fill orient-vertical-box w-textarea w-detail-svr-log' + (this.props.hide ? ' hide' : '')}>
        <div className="w-log-action-bar">
          <div className="w-textarea-bar">
            <a className="w-import" onClick={this.selectFile}
              href="javascript:;" draggable="false">Import</a>
            <a className={'w-download' + (disabled ? ' w-disabled' : '')} onDoubleClick={disabled ? undefined : this.download}
              onClick={disabled ? undefined : this.showNameInput} href="javascript:;" draggable="false">Export</a>
            <RecordBtn onClick={this.handleAction} />
            <a className={'w-clear' + (disabled ? ' w-disabled' : '')} onClick={disabled ? undefined : this.clearLogs} href="javascript:;" draggable="false">Clear</a>
            <div onMouseDown={this.preventBlur}
              style={{display: this.state.showNameInput ? 'block' : 'none'}}
              className="shadow w-textarea-input"><input ref="nameInput"
              onKeyDown={this.submit}
              onBlur={this.hideNameInput}
              type="text"
              maxLength="64"
              placeholder="Input the filename"
            />
              <button type="button" onClick={this.submit} className="btn btn-primary">OK</button>
            </div>
            <form ref="downloadForm" action="cgi-bin/download" style={{display: 'none'}}
              method="post" target="downloadTargetFrame">
              <input ref="type" name="type" value="log" type="hidden" />
              <input ref="filename" name="filename" type="hidden" />
              <input ref="content" name="content" type="hidden" />
            </form>
          </div>
        </div>
        <form ref="importDataForm" encType="multipart/form-data" style={{display: 'none'}}>
          <input ref="importData" onChange={this.importData} type="file" name="importData" accept=".log" />
        </form>
        <div ref="svrContainer" className="fill w-detail-log-content">
          <ul ref="svrContent">
            {logs.map(function(log) {
              var text = 'Date: ' + (new Date(log.date)).toLocaleString() + '\r\n' + log.text;
              var hide = log.hide ? ' hide' : '';
              return (
                <li key={log.id} title={log.level.toUpperCase()} className={'w-' + log.level + hide}>
                  <pre>
                    {text && text.length >= 2100 ? <ExpandCollapse text={text} /> : text}
                  </pre>
                </li>
              );
            })}
          </ul>
        </div>
        <FilterInput onChange={this.onServerFilterChange} />
      </div>
    );
  }
});

module.exports = ServerLog;
