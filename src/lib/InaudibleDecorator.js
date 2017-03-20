/* @flow */
import React from 'react';
import { Entity } from 'draft-js';

import type { ContentBlock } from 'draft-js';
import styles from '../RichTextEditor.css';

type Props = {
    children: ReactNode,
    entityKey: string
};

type EntityRangeCallback = (start: number, end: number) => void;

function Inaudible(props: Props) {
    const {type, timestamp} = Entity.get(props.entityKey).getData();
    return (
        <span className={styles[type]} data-timestamp={timestamp}>{props.children}</span>
    );
}

function findInaudibleEntities(contentBlock: ContentBlock, callback: EntityRangeCallback) {
    contentBlock.findEntityRanges((character) => {
        const entityKey = character.getEntity();
        return (
            entityKey != null &&
            Entity.get(entityKey).getType() === 'TOKEN'
        );
    }, callback);
}

export default {
    strategy: findInaudibleEntities,
    component: Inaudible
};
