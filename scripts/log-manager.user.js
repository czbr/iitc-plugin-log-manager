// ==UserScript==
// @id             iitc-plugin-log-manager@noxi515
// @name           IITC plugin: LogManager
// @category       Controls
// @version        0.2.2
// @namespace      http://git.noxi.biz/ingress/iitc-log-manager
// @description    ＼( 'ω')／
// @updateURL      https://git.noxi.biz/ingress/iitc-log-manager/raw/master/scripts/log-manager.meta.js
// @downloadURL    https://git.noxi.biz/ingress/iitc-log-manager/raw/master/scripts/log-manager.user.js
// @include        https://www.ingress.com/intel*
// @include        http://www.ingress.com/intel*
// @match          https://www.ingress.com/intel*
// @match          http://www.ingress.com/intel*
// @grant          none
// ==/UserScript==
function wrapper(plugin_info) {
    'use strict';
    var consts = {
        ROW_LIMIT: 1000,
        TEAM_NEU: -1,
        TEAM_ENL: 0,
        TEAM_RES: 1,
        TYPE_NONE: 0,
        TYPE_DESTROY_RESONATOR: 1,
        TYPE_DESTROY_LINK: 2,
        TYPE_DESTROY_FIELD: 3,
        TYPE_CAPTURE_PORTAL: 4,
        TYPE_DEPLOY_RESONATOR: 5,
        TYPE_CREATE_LINK: 6,
        TYPE_CREATE_FIELD: 7,
        instance: null,
        configDialog: null,
        convertTeam: function (text) {
            return text === 'RESISTANCE' ? consts.TEAM_RES : text === 'ENLIGHTENED' ? consts.TEAM_ENL : consts.TEAM_NEU;
        },
        convertType: function (text) {
            if (!text) {
                return consts.TYPE_NONE;
            }
            else if (text === ' destroyed a Resonator on ') {
                return consts.TYPE_DESTROY_RESONATOR;
            }
            else if (text === ' destroyed the Link ') {
                return consts.TYPE_DESTROY_LINK;
            }
            else if (text === ' destroyed a Control Field @') {
                return consts.TYPE_DESTROY_FIELD;
            }
            else if (text === ' captured ') {
                return consts.TYPE_CAPTURE_PORTAL;
            }
            else if (text === ' deployed a Resonator on ') {
                return consts.TYPE_DEPLOY_RESONATOR;
            }
            else if (text === ' linked ') {
                return consts.TYPE_CREATE_LINK;
            }
            else if (text === ' created a Control Field @') {
                return consts.TYPE_CREATE_FIELD;
            }
            else {
                return consts.TYPE_NONE;
            }
        },
        teamToCssClass: function (team) {
            return team === consts.TEAM_ENL ? 'enl' : team === consts.TEAM_RES ? 'res' : 'neu';
        },
        teamToLabel: function (team) {
            return team === consts.TEAM_ENL ? 'ENL' : team === consts.TEAM_RES ? 'RES' : 'NEU';
        },
        typeToLabel: function (type) {
            switch (type) {
                case consts.TYPE_NONE:
                    return '???';
                case consts.TYPE_DESTROY_RESONATOR:
                    return '-- Resonator';
                case consts.TYPE_DESTROY_LINK:
                    return '-- Link';
                case consts.TYPE_DESTROY_FIELD:
                    return '-- Field';
                case consts.TYPE_CAPTURE_PORTAL:
                    return '++ Capture';
                case consts.TYPE_DEPLOY_RESONATOR:
                    return '++ Resonator';
                case consts.TYPE_CREATE_LINK:
                    return '++ Link';
                case consts.TYPE_CREATE_FIELD:
                    return '++ Field';
                default:
                    return '';
            }
        },
        formatDate: function (date, format) {
            if (!format)
                format = 'yyyy-MM-dd HH:mm:ss.SSS';
            format = format.replace(/yyyy/g, "" + date.getFullYear());
            format = format.replace(/MM/g, ('0' + (date.getMonth() + 1)).slice(-2));
            format = format.replace(/dd/g, ('0' + date.getDate()).slice(-2));
            format = format.replace(/HH/g, ('0' + date.getHours()).slice(-2));
            format = format.replace(/mm/g, ('0' + date.getMinutes()).slice(-2));
            format = format.replace(/ss/g, ('0' + date.getSeconds()).slice(-2));
            if (format.match(/S/g)) {
                var milliSeconds = ('00' + date.getMilliseconds()).slice(-3);
                var length_1 = format.match(/S/g).length;
                for (var i = 0; i < length_1; i++) {
                    format = format.replace(/S/, milliSeconds.substring(i, i + 1));
                }
            }
            return format;
        },
        createPortalLink: function (log) {
            var lat = log.portalLat / 1000000;
            var lng = log.portalLng / 1000000;
            return "/intel?ll=" + lat + "," + lng + "&z=17&pll=" + lat + "," + lng;
        }
    };
    var LogManagerImpl = (function () {
        function LogManagerImpl(_window, plugin_info) {
            this._window = _window;
            this.plugin_info = plugin_info;
            if (typeof _window.plugin !== 'function') {
                _window.plugin = function () {
                };
            }
            this.db = new LogDB();
            consts.instance = this;
            consts.configDialog = new LogManagerConfigDialogImpl(_window, this.db);
            _window.plugin.logManager = consts;
        }
        LogManagerImpl.findFromMarkup = function (array, type) {
            for (var i = 0; i < array.length; i++) {
                var data = array[i];
                if (data[0] == type)
                    return data[1];
            }
            return null;
        };
        LogManagerImpl.prototype.initUI = function () {
            var _this = this;
            if (this._window.useAndroidPanes()) {
                // not supported
                return;
            }
            // Dialog open callback
            $('body').on('dialogopen', function (ev) {
                var target = ev.target;
                if (target.id != 'dialog-log-manager')
                    return;
                _this.onDialogOpen(target);
            });
            $('#toolbox')
                .append("<a id=\"toolbox-show-logs-popup\" title=\"Display a public chat log view [w]\" accesskey=\"w\">Logs</a>")
                .append("<a id=\"toolbox-show-log-config-popup\" title=\"Display LogManager configs\">Logs cfg</a>");
            $('#toolbox-show-logs-popup').on('click', function () {
                // dialog exists
                if ($('#dialog-log-manager').length > 0)
                    return;
                _this._window.dialog({
                    "id": 'log-manager',
                    "title": 'Logs',
                    "html": "<div id=\"log-manager-dialog-body\"></div>",
                    "width": 900,
                    "closeCallback": function () {
                        _this.dialog = null;
                    }
                });
            });
            $('#toolbox-show-log-config-popup').on('click', function () {
                consts.configDialog.show();
            });
        };
        LogManagerImpl.prototype.onDialogOpen = function (target) {
            var _this = this;
            this.dialog = new LogManagerDialogImpl($(target));
            this.dialog.setOnFilterValuesChangeListener(function (values) { return _this.onFilterValuesChanged(values); });
            this.db.getAll(consts.ROW_LIMIT)
                .then(function (result) { return _this.dialog.updateLogs(result); })
                .catch(function (e) { return console.error("Fetch Error: " + e); });
        };
        LogManagerImpl.prototype.onFilterValuesChanged = function (values) {
            var _this = this;
            var indexNameArgs = [];
            var args = [];
            if (values.type) {
                indexNameArgs.push('type');
                args.push(values.type);
            }
            if (values.pname) {
                indexNameArgs.push('pname');
                args.push(values.pname);
            }
            if (values.agname) {
                indexNameArgs.push('agname');
                args.push(values.agname);
            }
            var promise;
            if (indexNameArgs.length == 0) {
                if (!values.dateFrom && !values.dateTo) {
                    promise = this.db.getAll(consts.ROW_LIMIT);
                }
                else {
                    var lower = values.dateFrom ? values.dateFrom : new Date(2015, 1, 1, 0, 0, 0, 0);
                    var upper = values.dateTo ? values.dateTo : new Date();
                    promise = this.db.getWithCondition('time', consts.ROW_LIMIT, IDBKeyRange.bound(lower, upper));
                }
            }
            else {
                indexNameArgs.push('time');
                var lower = args.slice();
                lower.push(values.dateFrom ? values.dateFrom : new Date(2015, 1, 1, 0, 0, 0, 0));
                var upper = args.slice();
                upper.push(values.dateTo ? values.dateTo : new Date());
                promise = this.db.getWithCondition(indexNameArgs.join(','), consts.ROW_LIMIT, IDBKeyRange.bound(lower, upper));
            }
            promise.then(function (result) { return _this.dialog.updateLogs(result); })
                .catch(function (e) { return console.error("Fetch Error: " + e); });
        };
        LogManagerImpl.prototype.onPublishChatDataAvailable = function (data) {
            var _this = this;
            var result = data.result;
            var logs = [];
            result.forEach(function (chat) {
                var detail = chat[2].plext;
                if (detail.plextType != 'SYSTEM_BROADCAST')
                    return;
                var time = new Date(chat[1]);
                var player = LogManagerImpl.findFromMarkup(detail.markup, "PLAYER");
                var text = LogManagerImpl.findFromMarkup(detail.markup, "TEXT");
                var portal = LogManagerImpl.findFromMarkup(detail.markup, "PORTAL");
                var log = {
                    "id": chat[0].substr(0, 32),
                    "time": time,
                    "type": consts.convertType(text.plain),
                    "playerName": player.plain,
                    "playerTeam": consts.convertTeam(player.team),
                    "portalName": portal.name,
                    "portalLat": portal.latE6,
                    "portalLng": portal.lngE6,
                    "portalTeam": consts.convertTeam(portal.team)
                };
                logs.push(log);
                _this.db.add(log);
            });
            console.info(logs.length + " chat logs inserted.");
        };
        LogManagerImpl.prototype.exec = function () {
            var _this = this;
            var setup = function () {
                _this.initUI();
                _this._window.addHook('publicChatDataAvailable', function (data) { return _this.onPublishChatDataAvailable(data); });
            };
            setup.info = this.plugin_info;
            (this._window.bootPlugins || (this._window.bootPlugins = [])).push(setup);
            // if IITC has already booted, immediately run the 'setup' function
            if (this._window.iitcLoaded)
                setup();
        };
        return LogManagerImpl;
    })();
    var LogManagerDialogImpl = (function () {
        function LogManagerDialogImpl($root) {
            var _this = this;
            this.$root = $root;
            this.wrappers = new Array(1000);
            this.filterValues = {};
            this.$title = $root.prev().find('.ui-dialog-title');
            this.$filters = $($('#noxi-log-filter-template').html());
            this.$table = $($('#noxi-log-table-template').html());
            var $tableBody = $(this.$table.find('tbody'));
            var logRowTemplate = $('#noxi-log-row-template').html();
            for (var i = 0; i < 1000; i++) {
                var $row = $(logRowTemplate);
                $tableBody.append($row);
                this.wrappers[i] = new LogRowWrapper($row);
            }
            // Links in dialog events
            // Portal GUID unknown...so cannot open the portal panel...
            $tableBody.on('click', '.nx-plink', function (ev) {
                ev.preventDefault();
            });
            this.$root.children()
                .append(this.$filters)
                .append(this.$table);
            this.$inputs = this.$filters.find('input:text, select');
            this.$filters
                .on('keyup', 'input:text', function (ev) {
                    if (ev.keyCode !== 13)
                        return;
                    _this.onFilterChanged();
                })
                .on('change', 'select', function (ev) { return _this.onFilterChanged(); });
        }
        LogManagerDialogImpl.parseDate = function (str) {
            if (!str)
                return null;
            var year = parseInt(str.substr(0, 4));
            var month = parseInt(str.substr(5, 2)) - 1;
            var day = parseInt(str.substr(8, 2));
            var hour = parseInt(str.substr(11, 2));
            var minute = parseInt(str.substr(14, 2));
            var second = parseInt(str.substr(17, 2));
            return new Date(year, month, day, hour, minute, second, 0);
        };
        LogManagerDialogImpl.prototype.setOnFilterValuesChangeListener = function (listener) {
            this.filterChangeListener = listener;
        };
        LogManagerDialogImpl.prototype.updateLogs = function (result) {
            var logs = result.values;
            this.$title.text("Logs (" + logs.length + " in " + result.count + ")");
            var length = logs.length;
            this.wrappers.forEach(function (w, i) { return w.log = i < length ? logs[i] : null; });
        };
        LogManagerDialogImpl.prototype.onFilterChanged = function () {
            var newValues = {};
            for (var i = 0; i < this.$inputs.length; i++) {
                var el = this.$inputs[i];
                if (!el.checkValidity())
                    return;
                var key = el.id.replace(/^log-manager-/, '');
                var value = el.value;
                switch (key) {
                    case 'type':
                        newValues.type = value ? parseInt(value) : null;
                        break;
                    case 'pname':
                        newValues.pname = value ? value : null;
                        break;
                    case 'agname':
                        newValues.agname = value ? value : null;
                        break;
                    case 'dateFrom':
                        newValues.dateFrom = value ? LogManagerDialogImpl.parseDate(value) : null;
                        break;
                    case 'dateTo':
                        newValues.dateTo = value ? LogManagerDialogImpl.parseDate(value) : null;
                        break;
                }
            }
            this.filterValues = newValues;
            this.filterChanged();
        };
        LogManagerDialogImpl.prototype.filterChanged = function () {
            if (this.filterChangeListener)
                this.filterChangeListener(this.filterValues);
        };
        return LogManagerDialogImpl;
    })();
    var LogRowWrapper = (function () {
        function LogRowWrapper($root) {
            this.$root = $root;
            this.root = $root[0];
            this.time = this.root.children[0];
            this.type = this.root.children[1];
            this.portalName = this.root.children[2].children[0];
            this.portalTeam = this.root.children[3];
            this.playerName = this.root.children[4];
            this.playerTeam = this.root.children[5];
        }
        Object.defineProperty(LogRowWrapper.prototype, "log", {
            get: function () {
                return this._log;
            },
            set: function (log) {
                if (log == null) {
                    this.$root.hide();
                    return;
                }
                this.$root.show();
                this.time.textContent = consts.formatDate(log.time);
                this.type.textContent = consts.typeToLabel(log.type);
                this.portalName.textContent = log.portalName;
                this.portalName.href = consts.createPortalLink(log);
                this.portalTeam.textContent = consts.teamToLabel(log.portalTeam);
                this.playerName.textContent = log.playerName;
                this.playerTeam.textContent = consts.teamToLabel(log.playerTeam);
                LogRowWrapper.updateTeamCssClass(this.root, log.playerTeam);
                LogRowWrapper.updateTeamCssClass(this.portalTeam, log.portalTeam);
                LogRowWrapper.updateTeamCssClass(this.playerTeam, log.playerTeam);
                this._log = log;
            },
            enumerable: true,
            configurable: true
        });
        LogRowWrapper.updateTeamCssClass = function (element, newTeam) {
            element.classList.remove('neu');
            element.classList.remove('enl');
            element.classList.remove('res');
            element.classList.add(consts.teamToCssClass(newTeam));
        };
        return LogRowWrapper;
    })();
    var LogDB = (function () {
        function LogDB() {
            var _this = this;
            var req = indexedDB.open('log-manager', 2);
            req.onerror = function () { return console.error('IndexedDB open error'); };
            req.onsuccess = function (ev) { return _this.db = ev.target.result; };
            req.onupgradeneeded = function (ev) {
                _this.db = ev.target.result;
                _this.db.onerror = function (ev) { return console.error("DB error: " + ev); };
                var store;
                if (_this.db.objectStoreNames.contains('logs')) {
                    store = _this.db.transaction('logs', 'readwrite').objectStore('logs');
                    var indexNames = store.indexNames;
                    for (var i = 0; i < indexNames.length; i++) {
                        store.deleteIndex(indexNames[i]);
                    }
                }
                else {
                    store = _this.db.createObjectStore('logs', { "keyPath": "id" });
                }
                var nonUnique = { "unique": false };
                store.createIndex('time', 'time', nonUnique);
                store.createIndex('type,time', ['type', 'time'], nonUnique);
                store.createIndex('type,pname,time', ['type', 'portalName', 'time'], nonUnique);
                store.createIndex('type,agname,time', ['type', 'playerName', 'time'], nonUnique);
                store.createIndex('type,pname,agname,time', ['type', 'portalName', 'playerName', 'time'], nonUnique);
                store.createIndex('pname,time', ['portalName', 'time'], nonUnique);
                store.createIndex('pname,agname,time', ['portalName', 'playerName', 'time'], nonUnique);
                store.createIndex('agname,time', ['playerName', 'time'], nonUnique);
                store.createIndex('loc,time', ['portalLat', 'portalLng', 'time'], nonUnique);
                store.createIndex('type,loc,time', ['type', 'portalLat', 'portalLng', 'time'], nonUnique);
                store.createIndex('type,loc,pname,time', ['type', 'portalLat', 'portalLng', 'portalName', 'time'], nonUnique);
                store.createIndex('type,loc,agname,time', ['type', 'portalLat', 'portalLng', 'playerName', 'time'], nonUnique);
                store.createIndex('type,loc,pname,agname,time', ['type', 'portalLat', 'portalLng', 'portalName', 'playerName', 'time'], nonUnique);
            };
        }
        LogDB.prototype.add = function (log) {
            var req = this.getWritableStore().add(log);
            req.onsuccess = function () { return console.debug('insert success'); };
            req.onerror = function () {
                try {
                    console.warn("insert error: " + this.error.message);
                }
                catch (e) {
                }
            };
        };
        LogDB.prototype.addAll = function (logs) {
            var store = this.getWritableStore();
            for (var i = 0; i < logs.length; i++) {
                var req = store.add(logs[i]);
                req.onsuccess = function () { return console.debug('insert success'); };
                req.onerror = function () {
                    try {
                        console.warn("insert error: " + this.error.message);
                    }
                    catch (e) {
                    }
                };
            }
        };
        LogDB.prototype.getAll = function (limit) {
            return this.getWithCondition('time', limit, null);
        };
        LogDB.prototype.getWithCondition = function (indexName, limit, range) {
            var _this = this;
            return this.getCount(indexName, range)
                .then(function (count) { return _this.fetch(indexName, count > limit ? limit : count, range)
                    .then(function (logs) { return Promise.resolve({ "count": count, "values": logs }); }); });
        };
        LogDB.prototype.clearAll = function () {
            var _this = this;
            return new Promise(function (resolve, reject) {
                var req = _this.getWritableStore().clear();
                req.onsuccess = function () { return resolve(); };
                req.onerror = function () { return reject(); };
            });
        };
        LogDB.prototype.getCount = function (indexName, range) {
            var _this = this;
            if (range === void 0) { range = null; }
            return new Promise(function (resolve, reject) {
                var req = range
                    ? _this.getWritableStore().index(indexName).count(range)
                    : _this.getWritableStore().index(indexName).count();
                req.onerror = reject;
                req.onsuccess = function () { return resolve(req.result); };
            });
        };
        LogDB.prototype.fetch = function (indexName, limit, range, direction) {
            var _this = this;
            if (range === void 0) { range = null; }
            if (direction === void 0) { direction = 'prev'; }
            return new Promise(function (resolve, reject) {
                var req = _this.getWritableStore().index(indexName).openCursor(range, direction);
                var logs = [];
                req.onerror = reject;
                req.onsuccess = function (ev) {
                    var cursor = ev.target.result;
                    if (cursor) {
                        logs.push(cursor.value);
                        if (logs.length < limit) {
                            cursor.continue();
                        }
                        else {
                            resolve(logs);
                        }
                    }
                    else {
                        resolve(logs);
                    }
                };
            });
        };
        LogDB.prototype.getWritableStore = function () {
            return this.db.transaction(['logs'], 'readwrite').objectStore('logs');
        };
        LogDB.prototype.getReadableStore = function () {
            return this.db.transaction(['logs'], 'readonly').objectStore('logs');
        };
        return LogDB;
    })();
    var LogManagerConfigDialogImpl = (function () {
        function LogManagerConfigDialogImpl(_window, db) {
            this._window = _window;
            this.db = db;
            this.initialized = false;
        }
        LogManagerConfigDialogImpl.prototype.show = function () {
            if (!this.initialized) {
                this.init();
                this.initialized = true;
            }
            var $dialog = $('#dialog-log-manager-config');
            if ($dialog.length > 0 && $dialog.dialog('isOpen')) {
                $dialog.dialog('moveToTop');
                return;
            }
            this._window.dialog({
                "id": 'log-manager-config',
                "title": 'Log configs',
                "width": 300,
                "html": "\n<div id=\"log-manager-config-dialog-body\">\n    <a id=\"delete-logs\">Delete all logs</a>\n</div>",
                "closeCallback": function () {
                }
            });
        };
        LogManagerConfigDialogImpl.prototype.init = function () {
            var _this = this;
            // Add event handlers
            $(document.body).on('dialogopen', function (ev) {
                var target = ev.target;
                if (target.id != 'dialog-log-manager-config')
                    return;
                _this.attachEventHandlers();
            });
        };
        LogManagerConfigDialogImpl.prototype.attachEventHandlers = function () {
            var _this = this;
            var $body = $('#log-manager-config-dialog-body');
            $body.on('click', '#delete-logs', function () {
                _this.db.clearAll()
                    .then(function () {
                        alert("Delete logs complete.");
                        window.location.reload();
                    });
            });
        };
        return LogManagerConfigDialogImpl;
    })();
    new LogManagerImpl(window, plugin_info).exec();
}
// inject code into site context
var script = document.createElement('script');
script.id = 'noxi-iitc-log-manager';
var info = {};
if (typeof GM_info !== 'undefined' && GM_info && GM_info.script)
    info.script = {
        version: GM_info.script.version,
        name: GM_info.script.name,
        description: GM_info.script.description
    };
script.appendChild(document.createTextNode("(" + wrapper + ")(" + JSON.stringify(info) + ");"));
(document.body || document.head || document.documentElement).appendChild(script);
// BEGIN CSS
var style = document.createElement('style');
style.id = 'noxi-iitc-log-manager-css';
style.type = 'text/css';
style.appendChild(document.createTextNode("\n#dialog-log-manager {\n    max-width: 900px !important;\n}\n\n.log-manager-logs {\n    table-layout: fixed;\n    width: 876px;\n}\n\n.log-manager-logs th,\n.log-manager-logs td {\n    border-bottom: 1px solid #0B314E;\n    padding: 3px 5px;\n}\n\n.log-manager-logs td {\n    white-space: nowrap;\n    overflow: hidden;\n}\n\n.log-manager-logs .nx-time {\n    width: 150px;\n}\n\n.log-manager-logs .nx-type {\n    width: 80px;\n}\n\n.log-manager-logs .nx-pname {\n    width: 400px;\n}\n\n.log-manager-logs .nx-pteam,\n.log-manager-logs .nx-agteam {\n    width: 38px;\n}\n\n.log-manager-logs .nx-agname {\n    width: 100px;\n}\n\n.log-manager-logs tr.neu,\n.log-manager-logs td.neu {\n    color: #ffffff !important;\n}\n\n.log-manager-logs tr.enl,\n.log-manager-logs td.enl {\n    color: #03FE03 !important;\n}\n\n.log-manager-logs tr.enl {\n    background-color: #017F01;\n}\n\n.log-manager-logs tr.res,\n.log-manager-logs td.res {\n    color: #00C5FF !important;\n}\n\n.log-manager-logs tr.res {\n    background-color: #005684;\n}\n\n.log-manager-filters {\n}\n\n.log-manager-filter-row {\n}\n\n.log-manager-filter {\n    float: left;\n    width: 32%;\n    height: 26px;\n}\n\n.log-manager-filter label {\n    width: 35%;\n    float: left;\n    padding-top: 6px;\n    font-size: 14px;\n    font-weight: bold;\n}\n\n.log-manager-filter div.filter-container {\n    width: 65%;\n    float: left;\n}\n\n/* Log manager config */\n#dialog-log-manager-config {\n    max-width: 300px !important;\n}\n\n#log-manager-config-dialog-body a {\n    display: block;\n    color: #ffce00;\n    border: 1px solid #ffce00;\n    padding: 3px 0;\n    margin: 10px auto;\n    width: 80%;\n    text-align: center;\n    background: rgba(8, 48, 78, .9);\n}\n\n#log-manager-config-dialog-body a.disabled,\n#log-manager-config-dialog-body a.disabled:hover {\n    color: #666;\n    border-color: #666;\n    text-decoration: none;\n}\n"));
document.head.appendChild(style);
// END CSS
// BEGIN HTML Template
var logFilterTemplate = document.createElement('script');
logFilterTemplate.id = 'noxi-log-filter-template';
logFilterTemplate.type = 'text/template';
logFilterTemplate.appendChild(document.createTextNode("\n<div class=\"log-manager-filters\">\n    <div class=\"log-manager-filter-row\">\n        <div class=\"log-manager-filter\">\n            <label for=\"log-manager-type\">Type</label>\n            <div class=\"filter-container\">\n                <select id=\"log-manager-type\">\n                    <option value=\"\">ALL</option>\n                    <option value=\"1\">Destroy resonator</option>\n                    <option value=\"2\">Destroy link</option>\n                    <option value=\"3\">Destroy field</option>\n                    <option value=\"4\">Capture portal</option>\n                    <option value=\"5\">Deploy resonator</option>\n                    <option value=\"6\">Create link</option>\n                    <option value=\"7\">Create field</option>\n                </select>\n            </div>\n        </div>\n        <div class=\"log-manager-filter\">\n            <label for=\"log-manager-pname\">Portal Name</label>\n            <div class=\"filter-container\">\n                <input type=\"text\" id=\"log-manager-pname\" placeholder=\"Portal name\"/>\n            </div>\n        </div>\n        <div class=\"log-manager-filter\">\n            <label for=\"log-manager-dateFrom\">Date From</label>\n            <div class=\"filter-container\">\n                <input type=\"text\" id=\"log-manager-dateFrom\" placeholder=\"2015-01-01 00:00:00\" pattern=\"\\d{4}-\\d{2}-\\d{2}\\s\\d{2}:\\d{2}:\\d{2}\">\n            </div>\n        </div>\n    </div>\n    <div class=\"log-manager-filter-row\">\n        <div class=\"log-manager-filter\">\n        </div>\n        <div class=\"log-manager-filter\">\n            <label for=\"log-manager-agname\">Agent Name</label>\n            <div class=\"filter-container\">\n                <input type=\"text\" id=\"log-manager-agname\" placeholder=\"Agent name\">\n            </div>\n        </div>\n        <div class=\"log-manager-filter\">\n            <label for=\"log-manager-dateTo\">Date To</label>\n            <div class=\"filter-container\">\n                <input type=\"text\" id=\"log-manager-dateTo\" placeholder=\"2015-01-01 00:00:00\" pattern=\"\\d{4}-\\d{2}-\\d{2}\\s\\d{2}:\\d{2}:\\d{2}\"/>\n            </div>\n        </div>\n    </div>\n</div>\n"));
document.body.appendChild(logFilterTemplate);
var logTableTemplate = document.createElement('script');
logTableTemplate.id = 'noxi-log-table-template';
logTableTemplate.type = 'text/template';
logTableTemplate.appendChild(document.createTextNode("\n<table class=\"log-manager-logs\">\n    <thead>\n    <tr>\n        <th class=\"nx-time\">Time</th>\n        <th class=\"nx-type\">Type</th>\n        <th class=\"nx-pname\">Portal Name</th>\n        <th class=\"nx-pteam\">Portal Team</th>\n        <th class=\"nx-agname\">Player Name</th>\n        <th class=\"nx-agteam\">Player Team</th>\n    </tr>\n    </thead>\n    <tbody>\n    </tbody>\n</table>\n"));
document.body.appendChild(logTableTemplate);
var logRowTable = document.createElement('script');
logRowTable.id = 'noxi-log-row-template';
logRowTable.type = 'text/template';
logRowTable.appendChild(document.createTextNode("\n<tr class=\"log-manager-row\" style=\"display: none;\">\n    <td class=\"nx-time\"></td>\n    <td class=\"nx-type\"></td>\n    <td class=\"nx-pname\">\n        <a class=\"nx-plink\"></a>\n    </td>\n    <td class=\"nx-pteam\"></td>\n    <td class=\"nx-agname\"></td>\n    <td class=\"nx-agteam\"></td>\n</tr>\n"));
document.body.appendChild(logRowTable);
// END HTML Template
