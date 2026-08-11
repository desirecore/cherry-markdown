/**
 * Copyright (C) 2021 Tencent.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import HookCenter from './HookCenter';
import { createElement } from '@/utils/dom';
import Logger from '@/Logger';
import {
  getAllowedShortcutKey,
  getStorageKeyMap,
  keyStack2UniqueString,
  storageKeyMap,
  isEnableShortcutKey,
} from '@/utils/shortcutKey';

/**
 * @typedef {()=>void} Bold 向cherry编辑器中插入粗体语法
 * @typedef {()=>void} Italic 向cherry编辑器中插入斜体语法
 * @typedef {(level:1|2|3|4|5|'1'|'2'|'3'|'4'|'5')=>void} Header  向cherry编辑器中插入标题语法
 * - level 标题等级 1~5
 * @typedef {()=>void} Strikethrough 向cherry编辑器中插入删除线语法
 * @typedef {(type:'ol'|'ul'|'checklist'|1|2|3|'1'|'2'|'3')=>void} List 向cherry编辑器中插入有序、无序列表或者checklist语法
 * - ol(1)有序
 * - ul(2)无序列表
 * - checklist(3)checklist
 * @typedef {`normal-table-${number}*${number}`} normalTableRowCol 插入表格语法约束
 * @typedef {(insert:'hr'|'br'|'code'|'formula'|'checklist'|'toc'|'link'|'image'|'video'|'audio'|'normal-table'|normalTableRowCol)=>void} Insert 向cherry编辑器中插入特定语法(需要在`toolbar`中预先配置功能)
 * - hr 水平分割线
 * - br 换行
 * - code 代码块
 * - formula 公式
 * - checklist 检查项
 * - toc 目录
 * - link 链接
 * - image 图片
 * - video 视频
 * - audio 音频
 * - normal-table 插入3行5列的表格
 * - normal-table-row*col 如normal-table-2*4插入2行(包含表头是3行)4列的表格
 * @typedef {(type:'1'|'2'|'3'|'4'|'5'|'6'|1|2|3|4|5|6|'flow'|'sequence'|'state'|'class'|'pie'|'gantt')=>void} Graph 向cherry编辑器中插入画图语法
 * - flow(1) 流程图
 * - sequence(2) 时序图
 * - state(3)状态图
 * - class(4)类图
 * - pie(5)饼图
 * - gantt(6)甘特图
 */

export default class Toolbar {
  /**
   * @typedef {{
   * bold?:Bold;
   * italic?:Italic;
   * header?:Header;
   * strikethrough?:Strikethrough;
   * list?:List;
   * insert?:Insert;
   * graph?:Graph;
   * [key:string]:any;
   * }} ToolbarHandlers
   * @type ToolbarHandlers 外部获取 toolbarHandlers 的部分功能
   */
  toolbarHandlers = {};

  constructor(options) {
    // 存储所有菜单的实例
    this.menus = {};
    // 存储所有快捷键的影射  {快捷键: 菜单名称}
    this.shortcutKeyMap = {};
    // 存储所有二级菜单面板
    this.subMenus = {};
    this.currentActiveSubMenu = null;
    // 默认的菜单配置
    this.options = {
      dom: document.createElement('div'),
      buttonConfig: ['bold'],
      customMenu: [],
    };

    Object.assign(this.options, options);
    this.$cherry = this.options.$cherry;
    this.instanceId = this.$cherry.instanceId;

    // Ribbon tabs: flatten all tab buttons into buttonConfig for HookCenter registration
    // Only for the main toolbar (not ToolbarRight subclass)
    const tabs = this.$cherry.options.toolbars.toolbarTabs;
    if (tabs && tabs.length > 0 && this.constructor === Toolbar) {
      this.ribbonTabs = tabs;
      this.options.buttonConfig = this.$flattenTabButtons(tabs);
    }

    this.menus = new HookCenter(this);
    this.drawMenus();
    this.collectShortcutKey();
    this.collectToolbarHandler();
    this.init();
  }

  init() {
    this.$handleCleanAllSubMenus = () => this.hideAllSubMenu();
    this.$handleModeCommitted = (payload) => this.$syncModeControls(payload?.mode);
    this.$handleDocumentClick = (e) => {
      const target = e.target instanceof Element ? e.target : null;
      if (
        this.currentActiveSubMenu &&
        !target?.closest('.cherry-dropdown') &&
        !target?.closest('.cherry-toolbar-button')
      ) {
        this.hideAllSubMenu();
      }
    };
    this.$cherry.$event.on('cleanAllSubMenus', this.$handleCleanAllSubMenus);
    this.$cherry.$event.on('modeCommitted', this.$handleModeCommitted);
    // 点击任意非下拉菜单区域时，关闭所有子菜单
    document.addEventListener('click', this.$handleDocumentClick, true);
    this.$syncModeControls(this.$cherry.$getCurrentModel?.());
  }

  /**
   * 销毁工具栏事件监听，避免重置或销毁编辑器后继续回写旧 DOM。
   */
  destroy() {
    if (this.$handleCleanAllSubMenus) {
      this.$cherry.$event.off('cleanAllSubMenus', this.$handleCleanAllSubMenus);
    }
    if (this.$handleModeCommitted) {
      this.$cherry.$event.off('modeCommitted', this.$handleModeCommitted);
    }
    if (this.$handleDocumentClick) {
      document.removeEventListener('click', this.$handleDocumentClick, true);
    }
    this.$handleCleanAllSubMenus = null;
    this.$handleModeCommitted = null;
    this.$handleDocumentClick = null;
  }

  /**
   * 以 modeCommitted 为唯一提交信号，同步 Ribbon/下拉菜单的视觉与可访问状态。
   * @param {'edit&preview'|'editOnly'|'previewOnly'|'wysiwyg'} mode
   */
  $syncModeControls(mode) {
    if (!mode) return;
    const roots = new Set([this.options.dom, this.$cherry.wrapperDom].filter(Boolean));
    roots.forEach((root) => {
      root.querySelectorAll('[data-editor-mode]').forEach((button) => {
        const selected = button.dataset.editorMode === mode;
        if (button.classList.contains('cherry-toolbar-button')) {
          button.classList.toggle('cherry-toolbar-button--selected', selected);
        }
        if (button.classList.contains('cherry-dropdown-item')) {
          button.classList.toggle('cherry-dropdown-item__selected', selected);
        }
        button.setAttribute('aria-pressed', String(selected));
      });
    });
  }

  /**
   * @deprecated use showOrHideToolbar
   */
  previewOnly() {
    this.showOrHideToolbar(false);
  }

  /**
   * @deprecated use showOrHideToolbar
   */
  showToolbar() {
    this.showOrHideToolbar(true);
  }

  showOrHideToolbar(isShow = true) {
    if (isShow) {
      this.options.dom.classList.remove('preview-only');
      this.$cherry.wrapperDom.classList.remove('cherry--no-toolbar');
      this.$cherry.$event.emit('toolbarShow');
    } else {
      this.options.dom.classList.add('preview-only');
      this.$cherry.wrapperDom.classList.add('cherry--no-toolbar');
      this.$cherry.$event.emit('toolbarHide');
    }
  }

  isHasLevel2Menu(name) {
    // FIXME: return boolean
    return this.menus.level2MenusName[name];
  }

  isHasConfigMenu(name) {
    // FIXME: return boolean
    return this.menus.hooks[name].subMenuConfig || [];
  }

  /**
   * 判断是否有子菜单，目前有两种子菜单配置方式：1、通过`subMenuConfig`属性 2、通过`buttonConfig`配置属性
   * @param {string} name
   * @returns {boolean} 是否有子菜单
   */
  isHasSubMenu(name) {
    return Boolean(this.isHasLevel2Menu(name) || this.isHasConfigMenu(name).length > 0);
  }

  /**
   * 根据配置画出来一级工具栏
   */
  drawMenus() {
    if (this.ribbonTabs) {
      this.$drawRibbonMenus();
    } else {
      this.$drawFlatMenus();
    }
  }

  /**
   * 扁平工具栏（原有逻辑）
   */
  $drawFlatMenus() {
    const fragLeft = document.createDocumentFragment();

    this.menus.level1MenusName.forEach((name) => {
      const btn = this.menus.hooks[name].createBtn();
      this.$bindBtnEvent(btn, name);
      if (this.isHasSubMenu(name)) {
        btn.classList.add('cherry-toolbar-dropdown');
      }
      fragLeft.appendChild(btn);
      this.menus.hooks[name].afterInit(btn);
    });

    this.appendMenusToDom(fragLeft);
  }

  /**
   * Ribbon 标签页工具栏（Word 风格）
   */
  $drawRibbonMenus() {
    this.options.dom.classList.add('cherry-toolbar--ribbon');

    const ribbon = createElement('div', 'cherry-ribbon');
    const tabHeaders = createElement('div', 'cherry-ribbon-tabs');
    const tabPanelsContainer = createElement('div', 'cherry-ribbon-panels');

    this.ribbonTabs.forEach((tab, index) => {
      // Tab header
      const header = createElement('div', `cherry-ribbon-tab${index === 0 ? ' cherry-ribbon-tab--active' : ''}`);
      header.textContent = this.$cherry.locale[tab.name] || tab.name;
      header.dataset.tabName = tab.name;
      header.addEventListener('click', () => this.$switchRibbonTab(tab.name));
      tabHeaders.appendChild(header);

      // Tab panel
      const panel = createElement('div', `cherry-ribbon-panel${index === 0 ? ' cherry-ribbon-panel--active' : ''}`);
      panel.dataset.tabName = tab.name;

      if (tab.groups) {
        // 分组模式（Word 风格）
        panel.classList.add('cherry-ribbon-panel--grouped');
        tab.groups.forEach((group, groupIndex) => {
          const groupEl = createElement('div', 'cherry-ribbon-group');
          groupEl.dataset.groupName = group.name;

          const buttonsEl = createElement('div', 'cherry-ribbon-group__buttons');
          group.buttons.forEach((btnConfig) => {
            this.$renderRibbonButton(buttonsEl, btnConfig, {
              styleCard: group.styleCard,
              showLabel: group.showLabel,
              large: group.large,
            });
          });
          groupEl.appendChild(buttonsEl);

          panel.appendChild(groupEl);

          if (groupIndex < tab.groups.length - 1) {
            panel.appendChild(createElement('span', 'cherry-ribbon-group-separator'));
          }
        });
      } else {
        // 扁平模式（原有逻辑）
        (tab.buttons || []).forEach((btnConfig) => {
          this.$renderRibbonButton(panel, btnConfig);
        });
      }

      tabPanelsContainer.appendChild(panel);
    });

    ribbon.appendChild(tabHeaders);
    ribbon.appendChild(tabPanelsContainer);

    const toolbarLeft = createElement('div', 'toolbar-left');
    toolbarLeft.appendChild(ribbon);
    this.options.dom.appendChild(toolbarLeft);
  }

  /**
   * 渲染单个 Ribbon 按钮到容器
   * @param {Object} [groupOptions] 分组选项
   * @param {boolean} [groupOptions.styleCard] 是否以样式卡片形式渲染
   * @param {boolean|string[]} [groupOptions.showLabel] true=全部显示文字, 数组=指定按钮显示文字
   * @param {boolean|string[]} [groupOptions.large] true=全部使用大按钮, 数组=指定菜单名
   */
  $renderRibbonButton(container, btnConfig, groupOptions = {}) {
    if (btnConfig === '|') {
      container.appendChild(createElement('span', 'cherry-toolbar-button cherry-toolbar-split'));
      return;
    }

    const name = typeof btnConfig === 'string' ? btnConfig : Object.keys(btnConfig)[0];
    const hook = this.menus.hooks[name];
    if (!hook) return;

    // Ribbon 模式：如果 hook 标记了 ribbonFlatten，则平铺子菜单项为独立按钮
    const subConfig = hook.getSubMenuConfig();
    if (hook.ribbonFlatten && subConfig && subConfig.length > 0) {
      const isRadioGroup =
        typeof hook.getActiveSubMenuIndex === 'function' &&
        Object.prototype.hasOwnProperty.call(hook.constructor.prototype, 'getActiveSubMenuIndex');
      const usesCommittedModeState = subConfig.some((item) => Boolean(item.editorMode));
      const groupBtns = [];

      subConfig.forEach((item, idx) => {
        if (item.name === '|') {
          container.appendChild(createElement('span', 'cherry-toolbar-button cherry-toolbar-split'));
          return;
        }
        const isModeControl = Boolean(item.editorMode);
        const subBtn = createElement(
          isModeControl ? 'button' : 'span',
          `cherry-toolbar-button cherry-toolbar-${item.iconName || item.name}`,
          {
            title: this.$cherry.locale[item.name] || item.name,
            ...(isModeControl ? { type: 'button', 'aria-pressed': 'false' } : {}),
          },
        );
        if (isModeControl) {
          subBtn.dataset.editorMode = item.editorMode;
        }
        if (item.iconName) {
          const icon = createElement('i', `ch-icon ch-icon-${item.iconName}`);
          subBtn.appendChild(icon);
        }
        if (isRadioGroup) {
          subBtn.dataset.ribbonGroup = name;
          subBtn.dataset.ribbonIndex = String(idx);
          groupBtns.push(subBtn);
        }
        subBtn.addEventListener(
          'click',
          (e) => {
            e.stopPropagation();
            this.hideAllSubMenu();
            item.onclick(/** @type {MouseEvent} */ (e));
            // 单选组：点击后更新选中状态
            if (isRadioGroup && !usesCommittedModeState) {
              // 延迟更新，等 switchModel 完成状态变更
              requestAnimationFrame(() => {
                const activeIdx = hook.getActiveSubMenuIndex(null);
                const activeIndices = Array.isArray(activeIdx) ? activeIdx : [activeIdx];
                groupBtns.forEach((btn, i) => {
                  btn.classList.toggle('cherry-toolbar-button--selected', activeIndices.includes(i));
                });
              });
            }
          },
          false,
        );
        container.appendChild(subBtn);
      });

      // 初始化单选组的激活状态
      if (isRadioGroup && groupBtns.length > 0 && !usesCommittedModeState) {
        requestAnimationFrame(() => {
          const activeIdx = hook.getActiveSubMenuIndex(null);
          const activeIndices = Array.isArray(activeIdx) ? activeIdx : [activeIdx];
          groupBtns.forEach((btn, i) => {
            btn.classList.toggle('cherry-toolbar-button--selected', activeIndices.includes(i));
          });
        });
      }
      this.$syncModeControls(this.$cherry.$getCurrentModel?.());
      return;
    }

    const btn = hook.createBtn();
    const { showLabel, large } = groupOptions;
    if (showLabel === true || (Array.isArray(showLabel) && showLabel.includes(name))) {
      btn.classList.add('cherry-ribbon-btn--labeled');
    }
    if (large === true || (Array.isArray(large) && large.includes(name))) {
      btn.classList.add('cherry-ribbon-btn--large');
    }
    this.$bindBtnEvent(btn, name);
    if (this.isHasSubMenu(name)) {
      btn.classList.add('cherry-toolbar-dropdown');
    }
    container.appendChild(btn);
    hook.afterInit(btn);
  }

  /**
   * 为按钮绑定点击事件
   */
  $bindBtnEvent(btn, name) {
    if (typeof window === 'object' && 'onpointerup' in window) {
      btn.addEventListener(
        'pointerdown',
        () => {
          this.isPointerDown = true;
        },
        false,
      );
      btn.addEventListener(
        'pointerup',
        (event) => {
          this.isPointerDown && this.onClick(event, name);
          this.isPointerDown = false;
        },
        false,
      );
    } else {
      btn.addEventListener(
        'click',
        (event) => {
          this.onClick(event, name);
        },
        false,
      );
    }
  }

  /**
   * 切换 Ribbon 标签页
   */
  $switchRibbonTab(tabName) {
    const container = this.options.dom;
    container.querySelectorAll('.cherry-ribbon-tab').forEach((tab) => {
      if (tab instanceof HTMLElement) {
        tab.classList.toggle('cherry-ribbon-tab--active', tab.dataset.tabName === tabName);
      }
    });
    container.querySelectorAll('.cherry-ribbon-panel').forEach((panel) => {
      if (panel instanceof HTMLElement) {
        panel.classList.toggle('cherry-ribbon-panel--active', panel.dataset.tabName === tabName);
      }
    });
    this.hideAllSubMenu();
  }

  /**
   * 将 toolbarTabs 配置扁平化为 buttonConfig 数组
   */
  $flattenTabButtons(tabs) {
    const buttons = [];
    const seen = new Set();
    tabs.forEach((tab) => {
      const allButtons = tab.groups ? tab.groups.flatMap((g) => g.buttons) : tab.buttons || [];
      allButtons.forEach((btn) => {
        if (btn === '|') return;
        const name = typeof btn === 'string' ? btn : Object.keys(btn)[0];
        if (!seen.has(name)) {
          seen.add(name);
          buttons.push(btn);
        }
      });
    });
    return buttons;
  }

  appendMenusToDom(menus) {
    const toolbarLeft = createElement('div', 'toolbar-left');
    toolbarLeft.appendChild(menus);
    this.options.dom.appendChild(toolbarLeft);
  }

  setSubMenuPosition(menuObj, subMenuObj) {
    const pos = menuObj.getMenuPosition();
    // 200px: 避免下拉菜单超过右侧边栏；100: 补偿 margin-left:-95px + 5px 左侧间距
    const left = Math.max(100, Math.min(pos.left + pos.width / 2, window.innerWidth - 200));
    subMenuObj.style.left = `${left}px`;
    subMenuObj.style.top = `${pos.top + pos.height}px`;
    subMenuObj.style.position = menuObj.positionModel;
  }

  drawSubMenus(name) {
    this.subMenus[name] = createElement('div', 'cherry-dropdown', { name });
    this.setSubMenuPosition(this.menus.hooks[name], this.subMenus[name]);
    // 如果有配置的二级菜单
    const level2MenusName = this.isHasLevel2Menu(name);
    if (level2MenusName) {
      level2MenusName.forEach((level2Name) => {
        const subMenu = this.menus.hooks[level2Name];
        if (subMenu !== undefined && typeof subMenu.createBtn === 'function') {
          const btn = subMenu.createBtn(true);
          // 二级菜单的dom认定为一级菜单的
          subMenu.dom = subMenu.dom ? subMenu.dom : this.menus.hooks[name].dom;
          btn.addEventListener('click', (event) => this.onClick(event, level2Name, true), false);
          this.subMenus[name].appendChild(btn);
        }
      });
    }
    // 兼容旧版本配置的二级菜单
    const subMenuConfig = this.isHasConfigMenu(name);
    if (subMenuConfig.length > 0) {
      subMenuConfig.forEach((config) => {
        const btn = this.menus.hooks[name].createSubBtnByConfig(config);
        if (!config?.disabledHideAllSubMenu) {
          btn.addEventListener('click', () => this.hideAllSubMenu(), false);
        }
        this.subMenus[name].appendChild(btn);
      });
    }
    this.$cherry.wrapperDom.appendChild(this.subMenus[name]);
    this.$syncModeControls(this.$cherry.$getCurrentModel?.());
  }

  /**
   * 处理点击事件
   */
  onClick(event, name, focusEvent = false) {
    const menu = this.menus.hooks[name];
    if (!menu) {
      return;
    }
    if (this.isHasSubMenu(name) && !focusEvent) {
      this.toggleSubMenu(name);
    } else {
      /**
       * 如果定义了hideOtherSubMenu，则隐藏其他二级菜单，但不隐藏自己（因为其二级菜单是自己实现的独立逻辑）
       *  比如：颜色选择器、快捷键配置
       */
      // @ts-ignore
      if (typeof menu.hideOtherSubMenu === 'function') {
        // @ts-ignore
        menu.hideOtherSubMenu(() => this.hideAllSubMenu());
      } else {
        this.hideAllSubMenu();
      }
      menu.fire(event, name);
    }
  }

  /**
   * 激活二级菜单添加选中颜色
   * @param {string|string[]} name 菜单名称或菜单名称数组
   */
  activeSubMenuItem(name) {
    const names = Array.isArray(name) ? name : [name];

    names.forEach((menuName) => {
      const subMenu = this.subMenus[menuName];
      if (!subMenu) return;

      const indices = this.menus.hooks?.[menuName]?.getActiveSubMenuIndex(subMenu);
      const activeIndices = Array.isArray(indices) ? indices : [indices];

      subMenu.querySelectorAll('.cherry-dropdown-item').forEach((item, i) => {
        const selected = activeIndices.includes(i);
        item.classList.toggle('cherry-dropdown-item__selected', selected);
        if (item.hasAttribute('data-editor-mode')) {
          item.setAttribute('aria-pressed', String(selected));
        }
      });
    });
  }
  updateSubMenuPosition() {
    if (this.currentActiveSubMenu && this.subMenus[this.currentActiveSubMenu]) {
      this.setSubMenuPosition(this.menus.hooks[this.currentActiveSubMenu], this.subMenus[this.currentActiveSubMenu]);
    }
  }

  /**
   * 展开/收起二级菜单
   */
  toggleSubMenu(name) {
    if (!this.subMenus[name]) {
      // 如果没有二级菜单，则先画出来，然后再显示
      this.hideAllSubMenu();
      this.drawSubMenus(name);
      this.subMenus[name].style.display = 'block';
      this.activeSubMenuItem(name);
      this.currentActiveSubMenu = name;
      return;
    }
    if (this.subMenus[name].style.display === 'none') {
      // 如果是隐藏的，则先隐藏所有二级菜单，再显示当前二级菜单
      this.activeSubMenuItem(name);
      this.hideAllSubMenu();
      this.subMenus[name].style.display = 'block';
      this.setSubMenuPosition(this.menus.hooks[name], this.subMenus[name]);
      this.currentActiveSubMenu = name;
    } else {
      // 如果是显示的，则隐藏当前二级菜单
      this.subMenus[name].style.display = 'none';
      this.currentActiveSubMenu = null;
    }
  }

  /**
   * 隐藏所有的二级菜单
   */
  hideAllSubMenu() {
    this.currentActiveSubMenu = null;
    this.$cherry.wrapperDom.querySelectorAll('.cherry-dropdown').forEach((dom) => {
      dom.style.display = 'none';
    });
  }

  /**
   * 收集工具栏的各项信息，主要有：
   *   this.toolbarHandlers
   *   this.menus.hooks
   *   this.shortcutKeyMap
   * @param {Toolbar} toolbarObj 工具栏对象
   */
  collectMenuInfo(toolbarObj) {
    this.toolbarHandlers = Object.assign({}, this.toolbarHandlers, toolbarObj.toolbarHandlers);
    this.menus.hooks = Object.assign({}, toolbarObj.menus.hooks, this.menus.hooks);
    // 只有没设置自定义快捷键的时候才需要收集其他toolbar对象的快捷键配置
    if (!this.options.shortcutKey || Object.keys(this.options.shortcutKey).length <= 0) {
      this.shortcutKeyMap = Object.assign({}, this.shortcutKeyMap, toolbarObj.shortcutKeyMap);
    }
  }

  /**
   * 收集快捷键
   * @param {boolean} useUserSettings 是否使用用户配置的快捷键
   */
  collectShortcutKey(useUserSettings = true) {
    // 兼容旧版本配置
    if (
      this.$cherry.options.toolbars.shortcutKey &&
      Object.keys(this.$cherry.options.toolbars.shortcutKey).length > 0
    ) {
      Object.entries(this.$cherry.options.toolbars.shortcutKey).forEach(([key, value]) => {
        const $key = key
          .replace(/Ctrl-/g, 'Control-')
          .replace(/-([A-Za-z])$/g, (w, m1) => {
            return `-Key${m1.toUpperCase()}`;
          })
          .replace(/-([0-9])$/g, '-Digit$1');
        this.shortcutKeyMap[$key] = { hookName: value, aliasName: this.$cherry.locale[value] || value };
      });
    }
    if (this.$cherry.options.toolbars.shortcutKeySettings.isReplace) {
      this.shortcutKeyMap = this.$cherry.options.toolbars.shortcutKeySettings.shortcutKeyMap;
    } else {
      this.menus.allMenusName.forEach((name) => {
        this.menus.hooks[name].shortcutKeys?.forEach((key) => {
          this.shortcutKeyMap[key] = name;
        });
        if (typeof this.menus.hooks[name].shortcutKeyMap === 'object' && this.menus.hooks[name].shortcutKeyMap) {
          Object.entries(this.menus.hooks[name].shortcutKeyMap).forEach(([key, value]) => {
            if (key in this.shortcutKeyMap) {
              Logger.error(`The shortcut key ${key} is already registered`);
              return;
            }
            this.shortcutKeyMap[key] = value;
          });
        }
      });
      Object.entries(this.$cherry.options.toolbars.shortcutKeySettings.shortcutKeyMap).forEach(([key, value]) => {
        this.shortcutKeyMap[key] = value;
      });
      if (!useUserSettings) {
        return;
      }
      // 本地缓存的快捷键配置优先级最高，按 hookName-aliasName 替换相同的快捷键
      const cachedMap = getStorageKeyMap(this.$cherry.nameSpace);
      if (cachedMap) {
        const nameKeyMap = {};
        Object.entries(this.shortcutKeyMap).forEach(([key, value]) => {
          nameKeyMap[`${value.hookName}-${value.aliasName}`] = key;
        });
        Object.entries(cachedMap).forEach(([key, value]) => {
          const testKey = `${value.hookName}-${value.aliasName}`;
          if (nameKeyMap[testKey]) {
            delete this.shortcutKeyMap[nameKeyMap[testKey]];
          }
          this.shortcutKeyMap[key] = value;
        });
      }
    }
  }

  /**
   * 更新快捷键映射
   * @param {string} oldShortcutKey 旧的快捷键
   * @param {string} newShortcutKey 新的快捷键
   */
  updateShortcutKeyMap(oldShortcutKey, newShortcutKey) {
    if (oldShortcutKey === newShortcutKey) {
      return false;
    }
    const old = this.shortcutKeyMap[oldShortcutKey];
    if (!old) {
      return false;
    }
    // 删除旧值
    delete this.shortcutKeyMap[oldShortcutKey];
    // 更新内存中的映射
    this.shortcutKeyMap[newShortcutKey] = old;
    // 更新缓存中的映射
    storageKeyMap(this.$cherry.nameSpace, this.shortcutKeyMap);
  }

  collectToolbarHandler() {
    this.toolbarHandlers = this.menus.allMenusName.reduce((handlerMap, name) => {
      const menuHook = this.menus.hooks[name];
      if (!menuHook) {
        return handlerMap;
      }
      handlerMap[name] = (shortcut, _callback) => {
        if (typeof _callback === 'function') {
          Logger.warn(
            'MenuBase#onClick param callback is no longer supported. Please register the callback via MenuBase#registerAfterClickCb instead.',
          );
        }
        menuHook.fire.call(menuHook, undefined, shortcut);
      };
      return handlerMap;
    }, {});
  }

  /**
   * 监测是否有对应的快捷键
   * @param {KeyboardEvent} evt keydown 事件
   * @returns {boolean} 是否有对应的快捷键
   */
  matchShortcutKey(evt) {
    const onKeyStack = getAllowedShortcutKey(evt);
    const shortcutKey = keyStack2UniqueString(onKeyStack);
    return !!this.shortcutKeyMap?.[shortcutKey];
  }

  /**
   * 触发对应快捷键的事件
   * @param {KeyboardEvent} evt
   * @returns {boolean} 是否需要阻塞后续事件，true: 阻塞；false: 不阻塞
   */
  fireShortcutKey(evt) {
    // 如果禁用了快捷键，则不再触发快捷键事件
    if (!isEnableShortcutKey(this.$cherry.nameSpace)) {
      return false;
    }
    const onKeyStack = getAllowedShortcutKey(evt);
    const currentKey = keyStack2UniqueString(onKeyStack);
    const keyMap = this.shortcutKeyMap[currentKey]?.hookName;
    if (typeof keyMap === 'string' && keyMap) {
      this.menus.hooks[keyMap]?.fire(evt, currentKey);
    }
    return true;
  }
}
