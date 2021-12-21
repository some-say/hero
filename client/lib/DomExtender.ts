import StateMachine from 'awaited-dom/base/StateMachine';
import { ISuperElement } from 'awaited-dom/base/interfaces/super';
import { ISuperElementProperties } from 'awaited-dom/base/super-klasses/SuperElement';
import SuperElement from 'awaited-dom/impl/super-klasses/SuperElement';
import SuperNode from 'awaited-dom/impl/super-klasses/SuperNode';
import SuperHTMLElement from 'awaited-dom/impl/super-klasses/SuperHTMLElement';
import Element from 'awaited-dom/impl/official-klasses/Element';
import Node from 'awaited-dom/impl/official-klasses/Node';
import HTMLElement from 'awaited-dom/impl/official-klasses/HTMLElement';
import { ITypeInteraction } from '../interfaces/IInteractions';
import Interactor from './Interactor';
import { INodeVisibility } from '@ulixee/hero-interfaces/INodeVisibility';
import CoreFrameEnvironment from './CoreFrameEnvironment';

const { getState } = StateMachine<ISuperElement, ISuperElementProperties>();

interface IBaseExtend {
  $: {
    click: () => Promise<void>;
    type: (...typeInteractions: ITypeInteraction[]) => Promise<void>;
    waitForVisible: () => Promise<void>;
    getComputedVisibility: () => Promise<INodeVisibility>;
  };
}

declare module 'awaited-dom/base/interfaces/super' {
  interface ISuperElement extends IBaseExtend {}
  interface ISuperNode extends IBaseExtend {}
  interface ISuperHTMLElement extends IBaseExtend {}
}

declare module 'awaited-dom/base/interfaces/official' {
  interface IElement extends IBaseExtend {}
  interface INode extends IBaseExtend {}
  interface IHTMLElement extends IBaseExtend {}
}

for (const Item of [SuperElement, SuperNode, SuperHTMLElement, Element, Node, HTMLElement]) {
  void Object.defineProperty(Item.prototype, '$', {
    get: function $() {
      const click = async (): Promise<void> => {
        const { awaitedOptions } = getState(this);
        const coreFrame: CoreFrameEnvironment = await awaitedOptions?.coreFrame;
        await Interactor.run(coreFrame, [{ click: this }]);
      };
      const type = async (...typeInteractions: ITypeInteraction[]): Promise<void> => {
        const { awaitedOptions } = getState(this);
        const coreFrame: CoreFrameEnvironment = await awaitedOptions?.coreFrame;
        await click();
        await Interactor.run(
          coreFrame,
          typeInteractions.map(t => ({ type: t })),
        );
      };
      const waitForVisible = async (): Promise<void> => {
        const { awaitedPath, awaitedOptions } = getState(this);
        const coreFrame: CoreFrameEnvironment = await awaitedOptions?.coreFrame;
        await coreFrame.waitForElement(awaitedPath.toJSON(), { waitForVisible: true });
      };
      const getComputedVisibility = async (): Promise<void> => {
        const { awaitedOptions } = getState(this);
        const coreFrame: CoreFrameEnvironment = await awaitedOptions?.coreFrame;
        await coreFrame.getComputedVisibility(this);
      };

      return { click, type, waitForVisible, getComputedVisibility };
    },
  });
}
