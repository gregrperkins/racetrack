## Racetrack

Racetrack is a way to make sure that all your async calls are completed,
and to find out where they went wrong if any of them are not completed.

It's meant to be easy to drop in


#### Example output (within soyset mocha tests)

The first call is made with

```
racetrack.mocha(soySet, {print: true, indent: 2, fns: {
  '_resetToCompiledButNotLoaded': false
}});
```

And the second is just

`racetrack.mocha(soySet);`

Note that the second catches a bug that mocha missed!

```
  soyset
    ✓ is started with a proper soyJar
    getManifest
      ◦ gives callback a list of soy files: [0:getManifest] getManifest
 [1:getSoyRoots] getSoyRoots
   [2:_refresh] _refresh
   [2:_refresh] done.
     [3:_getSoyRoots] _getSoyRoots
     [3:_getSoyRoots] done.
 [1:getSoyRoots] done.
       [4:_soyRootsToSoyFiles] _soyRootsToSoyFiles
       [4:_soyRootsToSoyFiles] done.
[0:getManifest] done.
      ✓ gives callback a list of soy files
    makeProjectSoyJsRoot
      ✓ outputs a directory with compiled js (913ms)
1 incomplete calls in [object Object].
{ args: [ 'getSoyJsRoot' ],
  count: 10,
  name: 'getSoyJsRoot',
  descr: '[10:getSoyJsRoot]' }
```
