#

> 将 vue-class 版本转成 vue2
> 注意：对于 'vue-property-decorator'这个库里面的 Watch Emit Prop 处理了，其他的 Inject InjectReactive Model...没有处理
> 注意：static 静态属性没有处理 所有 class 中声明了 static 的文件转出来会报错 请删除 static 并在使用的时候用 this 替换
> 注意：class 里面的自定义修饰符被删除，请需要的手动加上

##

```bash
# install dependencies
npm install

#
npx vue-class-to-vue2 -- src
# or
npx vue-class-to-vue2 -- App.vue

```

#

github
[vue-class-to-vue2](https://github.com/liling-hash/vue-class-to-vue2/issues)

##
