/* @flow */
import {hasCommandModifier} from 'draft-js/lib/KeyBindingUtil';

import React, {Component} from 'react';
import ReactDOM from 'react-dom';
import {
    SelectionState,
    EditorState,
    CompositeDecorator,
    Entity,
    RichUtils,
    Modifier
} from 'draft-js';
import {ENTITY_TYPE} from 'draft-js-utils';
import DefaultToolbarConfig from './EditorToolbarConfig';
import StyleButton from './StyleButton';
import PopoverIconButton from '../ui/PopoverIconButton';
import ButtonGroup from '../ui/ButtonGroup';
import Dropdown from '../ui/Dropdown';
import IconButton from '../ui/IconButton';
import LinkDecorator from './LinkDecorator';
import InaudibleDecorator from './InaudibleDecorator';
import getEntityAtCursor from './getEntityAtCursor';
import clearEntityForRange from './clearEntityForRange';
import autobind from 'class-autobind';
import cx from 'classnames';

import styles from './EditorToolbar.css';

import type EventEmitter from 'events';
import type {ToolbarConfig} from './EditorToolbarConfig';

type ChangeHandler = (state: EditorState) => any;

type Props = {
  className?: string;
  editorState: EditorState;
  keyEmitter: EventEmitter;
  onChange: ChangeHandler;
  focusEditor: Function;
  toolbarConfig: ToolbarConfig;
};

type State = {
  showLinkInput: boolean;
};

const compositeDecorator = new CompositeDecorator([LinkDecorator, InaudibleDecorator]);

export default class EditorToolbar extends Component {
  props: Props;
  state: State;

  constructor() {
    super(...arguments);
    autobind(this);
    this.state = {
      showLinkInput: false,
    };
  }

  componentWillMount() {
    // Technically, we should also attach/detach event listeners when the
    // `keyEmitter` prop changes.
    this.props.keyEmitter.on('keypress', this._onKeypress);
  }

  componentWillUnmount() {
    this.props.keyEmitter.removeListener('keypress', this._onKeypress);
  }

  render() {
    let {className, toolbarConfig} = this.props;
    if (toolbarConfig == null) {
      toolbarConfig = DefaultToolbarConfig;
    }
    let display = toolbarConfig.display || DefaultToolbarConfig.display;
    let buttonsGroups = display.map((groupName) => {
      switch (groupName) {
        case 'INLINE_STYLE_BUTTONS': {
          return this._renderInlineStyleButtons(groupName, toolbarConfig);
        }
        case 'BLOCK_TYPE_DROPDOWN': {
          return this._renderBlockTypeDropdown(groupName, toolbarConfig);
        }
        case 'LINK_BUTTONS': {
          return this._renderLinkButtons(groupName, toolbarConfig);
        }
        case 'BLOCK_TYPE_BUTTONS': {
          return this._renderBlockTypeButtons(groupName, toolbarConfig);
        }
        case 'HISTORY_BUTTONS': {
          return this._renderUndoRedo(groupName, toolbarConfig);
        }
      }
    });
    return (
      <div className={cx(styles.root, className)}>
        {buttonsGroups}
      </div>
    );
  }

  _renderBlockTypeDropdown(name: string, toolbarConfig: ToolbarConfig) {
    let blockType = this._getCurrentBlockType();
    let choices = new Map(
      (toolbarConfig.BLOCK_TYPE_DROPDOWN || []).map((type) => [type.style, {label: type.label, className: type.className}])
    );
    if (!choices.has(blockType)) {
      blockType = Array.from(choices.keys())[0];
    }
    return (
      <ButtonGroup key={name}>
        <Dropdown
          choices={choices}
          selectedKey={blockType}
          onChange={this._selectBlockType}
        />
      </ButtonGroup>
    );
  }

  _renderBlockTypeButtons(name: string, toolbarConfig: ToolbarConfig) {
    let blockType = this._getCurrentBlockType();
    let buttons = (toolbarConfig.BLOCK_TYPE_BUTTONS || []).map((type, index) => (
      <StyleButton
        key={String(index)}
        isActive={type.style === blockType}
        label={type.label}
        onToggle={this._toggleBlockType}
        style={type.style}
        className={type.className}
      />
    ));
    return (
      <ButtonGroup key={name}>{buttons}</ButtonGroup>
    );
  }

  _renderInlineStyleButtons(name: string, toolbarConfig: ToolbarConfig) {
    let {editorState} = this.props;
    let currentStyle = editorState.getCurrentInlineStyle();
    let buttons = (toolbarConfig.INLINE_STYLE_BUTTONS || []).map((type, index) => (
      <StyleButton
        key={String(index)}
        isActive={currentStyle.has(type.style)}
        label={type.label}
        onToggle={this._toggleInlineStyle}
        style={type.style}
        className={type.className}
      />
    ));
    return (
      <ButtonGroup key={name}>{buttons}</ButtonGroup>
    );
  }

  _renderLinkButtons(name: string) {
    let {editorState} = this.props;
    let selection = editorState.getSelection();
    let entity = this._getEntityAtCursor();
    let hasSelection = !selection.isCollapsed();
    let isCursorOnLink = (entity != null && entity.type === ENTITY_TYPE.LINK);
    let shouldShowLinkButton = hasSelection || isCursorOnLink;
    return (
      <ButtonGroup key={name}>
        <PopoverIconButton
          label="Link"
          iconName="link"
          isDisabled={!shouldShowLinkButton}
          showPopover={this.state.showLinkInput}
          onTogglePopover={this._toggleShowLinkInput}
          onSubmit={this._setLink}
        />
        <IconButton
          label="Remove Link"
          iconName="remove-link"
          isDisabled={!isCursorOnLink}
          onClick={this._removeLink}
          focusOnClick={false}
        />
      </ButtonGroup>
    );
  }

  _renderUndoRedo(name: string) {
    let {editorState} = this.props;
    let canUndo = editorState.getUndoStack().size !== 0;
    let canRedo = editorState.getRedoStack().size !== 0;
    return (
      <ButtonGroup key={name}>
        <IconButton
          label="Undo"
          iconName="undo"
          isDisabled={!canUndo}
          onClick={this._undo}
          focusOnClick={false}
        />
        <IconButton
          label="Redo"
          iconName="redo"
          isDisabled={!canRedo}
          onClick={this._redo}
          focusOnClick={false}
        />
      </ButtonGroup>
    );
  }

  _onKeypress(event: Object, eventFlags: Object) {
    // Catch cmd+k for use with link insertion.
    if (hasCommandModifier(event) && event.keyCode === 75) {
      // TODO: Ensure there is some text selected.
      this.setState({showLinkInput: true});
      eventFlags.wasHandled = true;
      return;
    }

    // Catch cmd+u for use as INAUDIBLE insertion
    if (hasCommandModifier(event) && event.keyCode === 68) {
      this._createSpecialTag(
        '[INAUDIBLE]',
        Entity.create(
          'TOKEN',
          'IMMUTABLE',
          { type: 'inaudible', timestamp: this.props.currentTime || 0 }
        )
      );
      eventFlags.wasHandled = true;
      return;
    }

    // Catch cmd+t for use as CROSSTALK insertion
    if (hasCommandModifier(event) && event.keyCode === 84) {
      this._createSpecialTag(
        '[CROSSTALK]',
        Entity.create(
          'TOKEN',
          'IMMUTABLE',
          { type: 'crosstalk', timestamp: this.props.currentTime || 0 }
        )
      );
      eventFlags.wasHandled = true;
      return;
    }

    // Catch cmd+u for use as INAUDIBLE insertion
    if (hasCommandModifier(event) && event.keyCode !== 17) {
      console.log(event.keyCode);
      //eventFlags.wasHandled = true;
    }
  }

  _toggleShowLinkInput(event: ?Object) {
    let isShowing = this.state.showLinkInput;
    // If this is a hide request, decide if we should focus the editor.
    if (isShowing) {
      let shouldFocusEditor = true;
      if (event && event.type === 'click') {
        // TODO: Use a better way to get the editor root node.
        let editorRoot = ReactDOM.findDOMNode(this).parentNode;
        let {activeElement} = document;
        let wasClickAway = (activeElement == null || activeElement === document.body);
        if (!wasClickAway && !editorRoot.contains(activeElement)) {
          shouldFocusEditor = false;
        }
      }
      if (shouldFocusEditor) {
        this.props.focusEditor();
      }
    }
    this.setState({showLinkInput: !isShowing});
  }

  _setLink(url: string) {
    let {editorState} = this.props;
    let selection = editorState.getSelection();
    let entityKey = Entity.create(ENTITY_TYPE.LINK, 'MUTABLE', {url});
    this.setState({showLinkInput: false});
    this.props.onChange(
      RichUtils.toggleLink(editorState, selection, entityKey)
    );
    this._focusEditor();
  }

  _removeLink() {
    let {editorState} = this.props;
    let entity = getEntityAtCursor(editorState);
    if (entity != null) {
      let {blockKey, startOffset, endOffset} = entity;
      this.props.onChange(
        clearEntityForRange(editorState, blockKey, startOffset, endOffset)
      );
    }
  }

  _getEntityAtCursor(): ?Entity {
    let {editorState} = this.props;
    let entity = getEntityAtCursor(editorState);
    return (entity == null) ? null : Entity.get(entity.entityKey);
  }

  _getCurrentBlockType(): string {
    let {editorState} = this.props;
    let selection = editorState.getSelection();
    return editorState
      .getCurrentContent()
      .getBlockForKey(selection.getStartKey())
      .getType();
  }

  _createSpecialTag(text, entityKey) {
        const { editorState, onChange } = this.props;
        const content = editorState.getCurrentContent();
        const selection = editorState.getSelection();
        //@TODO: we need to only add extra space needs leading/trailing space
        const newContentState = Modifier.replaceText(
            content,
            selection,
            text,
            undefined,
            entityKey
        );
        const newEditorState = EditorState.push(editorState, newContentState, 'insert-fragment');
        const editorStateUpdate = EditorState.forceSelection(
            newEditorState, newContentState.getSelectionAfter()
        );
        onChange(editorStateUpdate);
  }
    _createImmutableEntity(text, entityKey) {
        const { editorState } = this.props;
        const currentContent = editorState.getCurrentContent();
        const selection = editorState.getSelection();
        let newContent, newState, selectionState, focusOffset;

        //@TODO: we need to only add extra space needs leading/trailing space
        if(selection.getAnchorOffset() === selection.getFocusOffset()) {
            newContent = Modifier.insertText(
                currentContent,
                selection,
                text
            );
        } else {
            newContent = Modifier.replaceText(
                currentContent,
                selection,
                text
            );
        }
        newState = EditorState.createWithContent(newContent, compositeDecorator);

        selectionState = SelectionState.createEmpty(newContent.getFirstBlock().getKey());
        focusOffset = selection.getFocusOffset() + text.length;
        selectionState = selectionState.merge({
            anchorOffset: selection.getAnchorOffset(),
            focusKey: newContent.getFirstBlock().getKey(),
            focusOffset: focusOffset
        });
        newContent = Modifier.applyEntity(newContent, selectionState, entityKey);
        newState = EditorState.createWithContent(newContent, compositeDecorator);

        selectionState = selectionState.merge({
            anchorOffset: focusOffset,
            focusKey: newContent.getFirstBlock().getKey(),
            focusOffset: focusOffset
        });
        newState = EditorState.forceSelection(newState, selectionState);

        this.props.onChange( newState );
        this._focusEditor();
        return;
    }

  _selectBlockType() {
    this._toggleBlockType(...arguments);
    this._focusEditor();
  }

  _toggleBlockType(blockType: string) {
    this.props.onChange(
      RichUtils.toggleBlockType(
        this.props.editorState,
        blockType
      )
    );
  }

  _toggleInlineStyle(inlineStyle: string) {
    this.props.onChange(
      RichUtils.toggleInlineStyle(
        this.props.editorState,
        inlineStyle
      )
    );
  }

  _undo() {
    let {editorState} = this.props;
    this.props.onChange(
      EditorState.undo(editorState)
    );
  }

  _redo() {
    let {editorState} = this.props;
    this.props.onChange(
      EditorState.redo(editorState)
    );
  }

  _focusEditor() {
    // Hacky: Wait to focus the editor so we don't lose selection.
    setTimeout(() => {
      this.props.focusEditor();
    }, 50);
  }
}
