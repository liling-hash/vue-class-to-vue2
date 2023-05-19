<template>
  <div id="app" ref="app">
    <router-view />
  </div>
</template>

<script>
import Vue from "vue";
import { Component, Watch } from "vue-property-decorator";
import { Mutation, State } from "vuex-class";
import cropperImg from "xxx";

@Component({ components: { cropperImg } })
export default class app extends Vue {
  @State("smdhDesktop") smdhDesktop;
  @State("minWidth") minWidth;
  @State("minHeight") minHeight;
  @State("screenObj") screenObj;
  @State("keepAliveData") keepAliveData;
  @Mutation("SETscreen") SETscreen;
  @Mutation("SETDigitalPrecision") SETDigitalPrecision;
  @Mutation("SETsmdhDesktop") SETsmdhDesktop;
  @State("url") url;

  @Watch("url")
  urlChange(val) {
    this.onresize();
  }

  cropperImgVal = false;

  // 监听窗口变化
  onresize() {
    let obj = {};
    obj = {
      h: window.innerHeight,
      w: window.innerWidth,
    };
    this.SETscreen(obj);
    window.onresize = null;
    // 监听窗口变化
    window.onresize = () => {
      obj = {
        h: window.innerHeight,
        w: window.innerWidth,
      };
      this.SETscreen(obj);
      obj = null;
    };
  }

  created() {
    // 异步获取electron桌面端的值
    if (window._smenv === "electron") {
      let timer = setInterval(() => {
        if (window.smdhDesktop) {
          this.SETsmdhDesktop(window.smdhDesktop);
          clearInterval(timer);
        }
      }, 100);
    }
  }

  mounted() {
    this.onresize();
    this.$refs.app.onclick = null;
    // 计算elDialog的高度
    Vue.prototype.elDialogHeight = (dom) => {
      let domHeight = this.screenObj.h;
      if (dom.$el.children[0]) {
        dom.$el.children[0].style.maxHeight = domHeight - 78 + "px";
      }
    };
    // 定义全局点击函数 (用来移动鼠标右键菜单的)
    Vue.prototype.globalClick = (callback) => {
      this.$refs.app.onclick = () => {
        callback();
      };
    };
  }
}
</script>

<style lang="less">
@import "./themes/publicStyle/default.less";

#app {
  min-height: 700px;
}
</style>
